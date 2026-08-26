const debug = () => {};
const info = (msg: string | object, ...args: any[]) => console.info(msg, args[0] ?? "");
const warn = (msg: string | object, ...args: any[]) => console.warn(msg, args[0] ?? "");
const error = (msg: string | object, ...args: any[]) => console.error(msg, args[0] || args);

export { debug, info, warn, error };
