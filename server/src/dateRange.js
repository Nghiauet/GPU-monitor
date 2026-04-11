/**
 * Extract from/to date range from Express query params with defaults.
 * @param {object} query - req.query
 * @param {number} defaultHours - fallback range in hours (default 24)
 * @returns {{ from: string, to: string }}
 */
export function getDateRange(query, defaultHours = 24) {
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - defaultHours * 3600 * 1000).toISOString();
  return {
    from: query.from || defaultFrom,
    to: query.to || now.toISOString(),
  };
}
