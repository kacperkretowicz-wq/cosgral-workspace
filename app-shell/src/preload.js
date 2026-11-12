"use strict";

/**
 * Narrow bridge for COSGRAL Workspace shell.
 * P0: no node APIs exposed to the page.
 * Later: notifications, folder pickers, openExternal helpers via contextBridge.
 */
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("cosgralShell", {
  name: "COSGRAL Workspace",
  version: "0.0.1",
});
