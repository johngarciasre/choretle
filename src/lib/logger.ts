const debug = (msg: string | object, ...args: any[]) => {
  const enabled = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("debug") === "1"
      || localStorage.getItem("choretle_debug") === "true"
    : process.env.DEBUG === "1";

  if (enabled) console.debug?.(msg, ...args);
};
const info = (msg: string | object, ...args: any[]) => console.info(msg, args[0] ?? "");
const warn = (msg: string | object, ...args: any[]) => console.warn(msg, args[0] ?? "");
const error = (msg: string | object, ...args: any[]) => console.error(msg, args[0] || args);

export { debug, info, warn, error };
