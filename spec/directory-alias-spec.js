const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

describe("Total Commander directory alias classification", () => {
  let directory, temporaryRoot, shellSpies, external;
  beforeEach(async () => {
    jasmine.useRealClock();
    shellSpies = {};
    for (const name of ["openPath", "openExternal", "openApplication", "showItemInFolder"])
      shellSpies[name] = spyOn(lumine.shell, name).and.resolveTo(
        name === "openApplication" ? 17 : "",
      );
    temporaryRoot = fs.realpathSync.native(os.tmpdir());
    directory = fs.realpathSync.native(fs.mkdtempSync(path.join(temporaryRoot, "totalcmd-alias-")));
    external = (
      await lumine.packages.activatePackage("open-external")
    ).mainModule.provideOpenExternal();
    await lumine.packages.activatePackage("open-in-totalcmd");
    lumine.config.set("open-in-totalcmd.path", "mock-totalcmd.exe");
  });
  afterEach(async () => {
    await Promise.allSettled(
      Object.values(shellSpies).flatMap((spy) => spy.calls.all().map((call) => call.returnValue)),
    );
    await lumine.packages.deactivatePackage("open-in-totalcmd");
    await lumine.packages.deactivatePackage("open-external");
    lumine.config.unset("open-in-totalcmd.path");
    await lumine.fileWatchClient.settlePendingTeardown();
    const relative = path.relative(temporaryRoot, directory);
    if (path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`))
      throw Error("Alias fixture escaped its root");
    await fs.promises.rm(directory, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  });
  it("opens an actual directory junction or symlink with the original alias argument", async () => {
    const target = path.join(directory, "target"),
      alias = path.join(directory, "directory alias");
    fs.mkdirSync(target);
    fs.symlinkSync(target, alias, "junction");
    expect(await external.openExternal(alias)).toBe("");
    expect(shellSpies.openApplication).toHaveBeenCalledOnceWith("mock-totalcmd.exe", [
      "/O",
      "/T",
      "/S",
      `/L=${alias}`,
    ]);
    expect(shellSpies.openPath).not.toHaveBeenCalled();
  });
  it("still falls through for a regular file without launching an application", async () => {
    const file = path.join(directory, "regular.txt");
    fs.writeFileSync(file, "regular");
    expect(await external.openExternal(file)).toBe("");
    expect(shellSpies.openApplication).not.toHaveBeenCalled();
    expect(shellSpies.openPath).toHaveBeenCalledOnceWith(file);
  });
  it("keeps a failed configured launch claimed instead of using a system fallback", async () => {
    const target = path.join(directory, "target"),
      alias = path.join(directory, "alias");
    fs.mkdirSync(target);
    fs.symlinkSync(target, alias, "junction");
    shellSpies.openApplication.and.rejectWith(new Error("mock launch refused"));
    const warning = spyOn(lumine.notifications, "addWarning");
    expect(await external.openExternal(alias)).toBe("");
    expect(warning).toHaveBeenCalledWith("Cannot open Total Commander", {
      detail: "mock-totalcmd.exe\n\nmock launch refused",
    });
    expect(shellSpies.openPath).not.toHaveBeenCalled();
  });
});
