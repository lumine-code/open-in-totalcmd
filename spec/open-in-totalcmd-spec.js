const fs = require("fs");
const os = require("os");
const path = require("path");

describe("open-in-totalcmd", () => {
  let openExternalModule, mainModule, tempDir, tempFile;

  beforeEach(async () => {
    openExternalModule = (await atom.packages.activatePackage("open-external")).mainModule;
    mainModule = (await atom.packages.activatePackage("open-in-totalcmd")).mainModule;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "open-in-totalcmd-"));
    tempFile = path.join(tempDir, "file.txt");
    fs.writeFileSync(tempFile, "content");
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
    expect(typeof handler.showInFolder).toBe("function");
  });

  it("observes the executable path setting", () => {
    atom.config.set("open-in-totalcmd.path", "custom/path/TOTALCMD64.EXE");
    expect(mainModule.exePath).toBe("custom/path/TOTALCMD64.EXE");
  });

  it("does not handle plain files in openExternal", async () => {
    const result = await getHandler().openExternal(tempFile);
    expect(result).toBeUndefined();
  });

  it("opens directories with the configured executable", async () => {
    atom.config.set("open-in-totalcmd.path", "git");
    const process = await getHandler().openExternal(tempDir);
    expect(process).toBeDefined();
    expect(typeof process.kill).toBe("function");
    process.kill();
  });

  it("shows files in the configured executable", () => {
    atom.config.set("open-in-totalcmd.path", "git");
    const process = getHandler().showInFolder(tempFile);
    expect(process).toBeDefined();
    expect(typeof process.kill).toBe("function");
    process.kill();
  });

  it("removes its handler on deactivation", async () => {
    expect(getHandler()).toBeDefined();
    await atom.packages.deactivatePackage("open-in-totalcmd");
    expect(getHandler()).toBeUndefined();
  });
});
