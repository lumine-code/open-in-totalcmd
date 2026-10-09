const fs = require("fs");
const os = require("os");
const path = require("path");
const { Disposable } = require("lumine");

describe("open-in-totalcmd", () => {
  let openExternalModule, mainModule, tempDir, tempFile, exePath, launch, shellSpies, temporaryRoot;

  beforeEach(async () => {
    shellSpies = {};
    // Baseline junction cases may decline the handler. Stub the actual system
    // fallback too, before activation: no native GUI app may be launched.
    for (const name of ["openPath", "openExternal", "openApplication", "showItemInFolder"])
      shellSpies[name] = spyOn(lumine.shell, name).and.resolveTo(
        name === "openApplication" ? 4242 : "",
      );
    launch = shellSpies.openApplication;
    openExternalModule = (await lumine.packages.activatePackage("open-external")).mainModule;
    mainModule = (await lumine.packages.activatePackage("open-in-totalcmd")).mainModule;
    temporaryRoot = fs.realpathSync.native(os.tmpdir());
    tempDir = fs.realpathSync.native(fs.mkdtempSync(path.join(temporaryRoot, "open-in-totalcmd-")));
    tempFile = path.join(tempDir, "file & 100% [model].txt");
    fs.writeFileSync(tempFile, "content");
    exePath = path.join(
      path.parse(tempDir).root,
      "Program Files",
      "Total Commander & Tests",
      "TOTALCMD64.EXE",
    );
    lumine.config.set("open-in-totalcmd.path", exePath);
  });

  afterEach(async () => {
    await Promise.allSettled(
      Object.values(shellSpies).flatMap((spy) => spy.calls.all().map((call) => call.returnValue)),
    );
    lumine.config.unset("open-in-totalcmd.path");
    await lumine.packages.deactivatePackage("open-in-totalcmd");
    await lumine.packages.deactivatePackage("open-external");
    await lumine.fileWatchClient.settlePendingTeardown();
    // Retries because Windows keeps a directory non-empty until the last handle on a child
    // closes, and `force` swallows only ENOENT.
    const relative = path.relative(temporaryRoot, tempDir);
    if (path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`))
      throw Error("Total Commander fixture escaped its root");
    fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });

  function getHandler() {
    return openExternalModule.handlers.find(
      ({ handler, active }) =>
        active && typeof handler.openExternal === "function" && handler.priority === 0,
    )?.handler;
  }

  it("registers a handler with the open-external service", () => {
    expect(mainModule.handlerDisposable).not.toBeNull();
    const handler = getHandler();
    expect(handler).toBeDefined();
    expect(Number.isFinite(handler.priority)).toBe(true);
    expect(typeof handler.showInFolder).toBe("function");
  });

  it("observes the executable path setting", () => {
    lumine.config.set("open-in-totalcmd.path", "custom/path/TOTALCMD64.EXE");
    expect(mainModule.exePath).toBe("custom/path/TOTALCMD64.EXE");
  });

  it("does not handle plain files in openExternal", async () => {
    const result = await getHandler().openExternal(tempFile);
    expect(result).toBeUndefined();
    expect(launch).not.toHaveBeenCalled();
  });

  it("opens directories with the configured executable", async () => {
    const directory = path.join(tempDir, "folder & 100% [model]");
    fs.mkdirSync(directory);
    expect(await getHandler().openExternal(directory)).toBe(4242);
    expect(launch).toHaveBeenCalledOnceWith(exePath, ["/O", "/T", "/S", `/L=${directory}`]);
  });

  it("shows files in the configured executable", async () => {
    expect(await getHandler().showInFolder(tempFile)).toBe(4242);
    expect(launch).toHaveBeenCalledOnceWith(exePath, [
      "/O",
      "/T",
      "/S",
      "/A",
      "/P",
      `/L=${tempFile}`,
    ]);
  });

  for (const [operation, target, fallback] of [
    ["openExternal", () => tempDir, "openPath"],
    ["showInFolder", () => tempFile, "showItemInFolder"],
  ]) {
    it(`reports a failed ${operation} launch and keeps the request claimed`, async () => {
      launch.and.rejectWith(new Error("Executable not found"));
      const warning = spyOn(lumine.notifications, "addWarning");
      const systemFallback = shellSpies[fallback];
      expect(await openExternalModule[operation](target())).toBe("");
      expect(launch).toHaveBeenCalledTimes(1);
      expect(warning).toHaveBeenCalledOnceWith("Cannot open Total Commander", {
        detail: `${exePath}\n\nExecutable not found`,
      });
      expect(systemFallback).not.toHaveBeenCalled();
    });
  }

  it("does not claim a missing directory as an external open", async () => {
    await expectAsync(getHandler().openExternal(path.join(tempDir, "missing"))).toBeRejected();
    expect(launch).not.toHaveBeenCalled();
  });

  it("removes its handler on deactivation", async () => {
    expect(getHandler()).toBeDefined();
    await lumine.packages.deactivatePackage("open-in-totalcmd");
    expect(getHandler()).toBeUndefined();
  });

  it("removes only the handler owned by a disconnected provider", () => {
    const original = mainModule.handlerDisposable;
    const disposeFirst = jasmine.createSpy("dispose first handler");
    const disposeSecond = jasmine.createSpy("dispose second handler");
    const first = new Disposable(disposeFirst);
    const second = new Disposable(disposeSecond);
    const firstEdge = mainModule.consumeOpenExternal({ registerHandler: () => first });
    const secondEdge = mainModule.consumeOpenExternal({ registerHandler: () => second });
    try {
      firstEdge.dispose();
      expect(disposeFirst).toHaveBeenCalledTimes(1);
      expect(disposeSecond).not.toHaveBeenCalled();
      expect(mainModule.handlerDisposable).toBe(second);
      secondEdge.dispose();
      expect(disposeSecond).toHaveBeenCalledTimes(1);
      expect(mainModule.handlerDisposable).toBeNull();
    } finally {
      firstEdge.dispose();
      secondEdge.dispose();
      mainModule.handlerDisposable = original;
    }
  });

  it("can disconnect its provider after deactivation", () => {
    const original = mainModule.handlerDisposable;
    const disposeHandler = jasmine.createSpy("dispose handler");
    const registration = new Disposable(disposeHandler);
    const edge = mainModule.consumeOpenExternal({ registerHandler: () => registration });
    try {
      mainModule.deactivate();
      expect(mainModule.handlerDisposable).toBeNull();
      expect(() => edge.dispose()).not.toThrow();
      expect(disposeHandler).toHaveBeenCalledTimes(1);
    } finally {
      edge.dispose();
      mainModule.activate();
      mainModule.handlerDisposable = original;
    }
  });
});
