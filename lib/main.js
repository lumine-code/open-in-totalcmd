const { Disposable } = require("lumine");
const fs = require("fs").promises;

module.exports = {
  exePath: null,

  activate() {
    this.handlerDisposable = null;
    this.configDisposable = lumine.config.observe("open-in-totalcmd.path", (value) => {
      this.exePath = value;
    });
  },

  deactivate() {
    this.handlerDisposable?.dispose();
    this.handlerDisposable = null;
    this.configDisposable?.dispose();
    this.configDisposable = null;
  },

  consumeOpenExternal(service) {
    const registration = service.registerHandler({
      priority: 0,
      openExternal: async (filePath) => {
        const exePath = this.exePath;
        if (!(await fs.stat(filePath)).isDirectory()) return;
        return this.openApplication(["/O", "/T", "/S", `/L=${filePath}`], exePath);
      },
      showInFolder: (filePath) => {
        return this.openApplication(["/O", "/T", "/S", "/A", "/P", `/L=${filePath}`]);
      },
    });
    this.handlerDisposable = registration;
    return new Disposable(() => {
      registration.dispose();
      if (this.handlerDisposable === registration) this.handlerDisposable = null;
    });
  },

  openApplication(args, exePath = this.exePath) {
    return lumine.shell.openApplication(exePath, args).catch((error) => {
      lumine.notifications.addWarning("Cannot open Total Commander", {
        detail: `${exePath}\n\n${error.message}`,
      });
      // This handler still owns the request when its configured application
      // cannot start. The system association would open a different program.
      return true;
    });
  },
};
