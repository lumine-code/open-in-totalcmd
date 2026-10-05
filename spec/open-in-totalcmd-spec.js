const fs = require("fs");
const os = require("os");
const path = require("path");

describe("open-in-totalcmd", () => {
  let openExternalModule, mainModule, tempDir, tempFile, exePath, launch;

  beforeEach(async () => {
    openExternalModule = (await lumine.packages.activatePackage("open-external")).mainModule;
    mainModule = (await lumine.packages.activatePackage("open-in-totalcmd")).mainModule;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "open-in-totalcmd-"));
    tempFile = path.join(tempDir, "file & 100% [model].txt");
    fs.writeFileSync(tempFile, "content");
    exePath = path.join(
      path.parse(tempDir).root,
      "Program Files",
      "Total Commander & Tests",
      "TOTALCMD64.EXE",
    );
    lumine.config.set("open-in-totalcmd.path", exePath);
    launch = spyOn(lumine.shell, "openApplication").and.resolveTo(4242);
  });

  afterEach(() => {
    // Retries because Windows keeps a directory non-empty until the last handle on a child
    // closes, and `force` swallows only ENOENT.
    fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });

  function getHandler() {
    return openExternalModule.handlers.find(
      (handler) => typeof handler.openExternal === "function" && handler.priority === 0,
    );
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
      const systemFallback = spyOn(lumine.shell, fallback).and.resolveTo("");
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
});
