const { Disposable, BufferedProcess } = require("lumine");
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
    if (this.handlerDisposable) {
      this.handlerDisposable.dispose();
    }
    if (this.configDisposable) {
      this.configDisposable.dispose();
    }
  },

  consumeOpenExternal(service) {
    this.handlerDisposable = service.registerHandler({
      priority: 0,
      openExternal: async (filePath) => {
        if (!(await fs.lstat(filePath)).isDirectory()) return;
        return new BufferedProcess({
          command: this.exePath,
          args: ["/O", "/T", "/S", `/L=${filePath}`],
        });
      },
      showInFolder: (filePath) => {
        return new BufferedProcess({
          command: this.exePath,
          args: ["/O", "/T", "/S", "/A", "/P", `/L=${filePath}`],
        });
      },
    });
    return new Disposable(() => {
      this.handlerDisposable.dispose();
      this.handlerDisposable = null;
    });
  },
};
