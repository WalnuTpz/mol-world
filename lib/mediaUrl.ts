// Database paths are literal filenames. Escape each segment only when producing
// a browser URL, so imported '#', '?' and '%' never become URL syntax.
export const publicMediaUrl = (value: string) =>
  value.split("/").map(encodeURIComponent).join("/");
