export function getRequiredPassword(env = process.env) {
  const password = env.GPU_MONITOR_PASSWORD;
  if (!password) {
    throw new Error('GPU_MONITOR_PASSWORD is required');
  }
  return password;
}
