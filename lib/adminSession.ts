const SESSION_COOKIE = "admin_session";

export const getAdminSessionCookieName = () => SESSION_COOKIE;

export const getExpectedSessionValue = () => {
  const user = process.env.REVIEW_USER;
  const pass = process.env.REVIEW_PASS;
  if (!user || !pass) return null;
  return Buffer.from(`${user}:${pass}`, "utf8").toString("base64");
};

export const isAdminSessionValid = (value?: string | null) => {
  const expected = getExpectedSessionValue();
  if (!expected || !value) return false;
  return value === expected;
};
