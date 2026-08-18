const LEVELS = {
  READ: "read",
  LOCAL_WRITE: "local_write",
  EXTERNAL: "external",
  DESTRUCTIVE: "destructive",
};

const ALWAYS_APPROVE = new Set([
  "delete_file",
  "delete_directory",
  "send_email",
  "send_message",
  "publish",
  "purchase",
  "submit_form",
  "place_call",
  "change_account",
  "run_shell_unrestricted",
]);

function classify(action) {
  if (!action) return LEVELS.READ;
  if (ALWAYS_APPROVE.has(action)) return LEVELS.EXTERNAL;
  if (["write_file", "create_file", "move_file", "rename_file", "open_app", "open_url"].includes(action)) return LEVELS.LOCAL_WRITE;
  return LEVELS.READ;
}

function canAutoRun(action, settings = {}) {
  const level = classify(action);
  if (level === LEVELS.READ) return true;
  if (level === LEVELS.LOCAL_WRITE) return settings.allowLocalWrites !== false;
  return false;
}

function approvalResult(action, details) {
  return {
    ok: false,
    approvalRequired: true,
    action,
    details: details || null,
    message: `Approval required before JARVIS can perform: ${action}`,
  };
}

module.exports = { LEVELS, classify, canAutoRun, approvalResult };
