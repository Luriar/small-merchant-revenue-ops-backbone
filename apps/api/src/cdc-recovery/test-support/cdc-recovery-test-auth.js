const { forbiddenError, unauthorizedError } = require("../cdc-recovery-errors");

function authorizeTestRole(context, allowedRoles) {
  if (!context?.authenticated) {
    throw unauthorizedError();
  }

  if (!allowedRoles.includes(context.role)) {
    throw forbiddenError();
  }

  return {
    role: context.role,
    allowedRoles,
  };
}

module.exports = {
  authorizeTestRole,
};
