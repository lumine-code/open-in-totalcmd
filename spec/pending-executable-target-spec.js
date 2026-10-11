const fs = require("fs");
const os = require("os");
const path = require("path");

describe("Total Commander pending executable targets", () => {
  let scratch, temporaryRoot, service, launch, firstExecutable, nextExecutable, pending, release;

  beforeEach(async () => {
    for (const operation of ["openExternal", "openPath", "showItemInFolder", "openApplication"]) {
      if (!jasmine.isSpy(lumine.shell[operation])) {
        spyOn(lumine.shell, operation).and.resolveTo(operation === "openApplication" ? 4242 : "");
      }
    }
    launch = lumine.shell.openApplication;
    if (!jasmine.isSpy(lumine.application.openWindow)) {
      spyOn(lumine.application, "openWindow").and.resolveTo();
    }
    temporaryRoot = fs.realpathSync.native(os.tmpdir());
    scratch = fs.realpathSync.native(fs.mkdtempSync(path.join(temporaryRoot, "totalcmd-target-")));
    firstExecutable = path.join(scratch, "first manager.exe");
    nextExecutable = path.join(scratch, "next manager.exe");
    service = (await lumine.packages.activatePackage("open-external")).mainModule;
    await lumine.packages.activatePackage("open-in-totalcmd");
    lumine.config.set("open-in-totalcmd.path", firstExecutable);
    pending = release = null;
  });

  afterEach(async () => {
    release?.();
    if (pending) await Promise.allSettled([pending]);
    lumine.config.unset("open-in-totalcmd.path");
    for (const name of ["open-in-totalcmd", "open-external"]) {
      if (lumine.packages.isPackageLoaded(name)) await lumine.packages.unloadPackage(name);
    }
    await lumine.fileWatchClient.settlePendingTeardown();
    const relative = path.relative(temporaryRoot, fs.realpathSync.native(scratch));
    if (
      !relative ||
      relative === ".." ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      throw Error("Total Commander fixture escaped its private root");
    }
    fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });

  it("keeps the accepted executable while the real directory stat is pending", async () => {
    const actualStat = fs.promises.stat.bind(fs.promises);
    let reached;
    const statComplete = new Promise((resolve) => (reached = resolve));
    spyOn(fs.promises, "stat").and.callFake((filePath, ...args) => {
      if (filePath !== scratch) return actualStat(filePath, ...args);
      return actualStat(filePath, ...args).then(
        (stats) =>
          new Promise((resolve) => {
            release = () => resolve(stats);
            reached();
          }),
      );
    });
    pending = service.openExternal(scratch);
    await statComplete;
    lumine.config.set("open-in-totalcmd.path", nextExecutable);
    release();
    await pending;

    expect(launch).toHaveBeenCalledOnceWith(firstExecutable, ["/O", "/T", "/S", `/L=${scratch}`]);
    expect(lumine.shell.openPath).not.toHaveBeenCalled();
  });

  it("reports the executable that failed after the setting changes", async () => {
    let rejectLaunch;
    launch.and.returnValue(new Promise((_, reject) => (rejectLaunch = reject)));
    const warning = spyOn(lumine.notifications, "addWarning");
    pending = service.showInFolder(scratch);
    lumine.config.set("open-in-totalcmd.path", nextExecutable);
    release = () => rejectLaunch(new Error("owned launch refusal"));
    release();
    await pending;

    expect(launch.calls.mostRecent().args[0]).toBe(firstExecutable);
    expect(warning).toHaveBeenCalledOnceWith("Cannot open Total Commander", {
      detail: `${firstExecutable}\n\nowned launch refusal`,
    });
    expect(lumine.shell.showItemInFolder).not.toHaveBeenCalled();
  });

  it("uses a changed setting for the next ordinary directory request", async () => {
    await service.openExternal(scratch);
    lumine.config.set("open-in-totalcmd.path", nextExecutable);
    await service.openExternal(scratch);

    expect(launch.calls.allArgs()).toEqual([
      [firstExecutable, ["/O", "/T", "/S", `/L=${scratch}`]],
      [nextExecutable, ["/O", "/T", "/S", `/L=${scratch}`]],
    ]);
  });
});
