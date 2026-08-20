// Maps English error text from our API routes and from Supabase to dictionary keys.
// Substring matching, because Supabase appends details (retry seconds, field names).
// ORDER MATTERS: longer, more specific needles must come before the shorter ones
// they contain, or the short one wins and the specific message is never reached.
// Returns null for anything unrecognised so the caller shows the raw English text --
// an unknown failure must stay visible rather than collapse into a generic message.

const MAP: readonly (readonly [string, string])[] = [
  ['This email is already registered', 'err.emailRegistered'],
  ['This phone number is already registered', 'err.phoneRegistered'],
  ['Failed to verify email', 'err.emailLookupFailed'],
  ['Failed to verify phone number', 'err.phoneLookupFailed'],
  ['Failed to create verification code', 'err.createCodeFailed'],
  ['Failed to send email', 'err.sendEmailFailed'],
  ['Verification code not found', 'err.codeNotFound'],
  ['Verification code expired', 'err.codeExpired'],
  ['Incorrect verification code', 'err.codeIncorrect'],
  ['Missing email or code', 'err.missingEmailOrCode'],
  ['Missing phone or code', 'err.missingPhoneOrCode'],
  ['Missing email', 'err.missingEmail'],
  ['Missing phone number', 'err.missingPhone'],
  ['Too many codes requested for this number', 'err.otpTooManyRequests'],
  ['Please wait a minute before requesting another code', 'err.otpCooldown'],
  ['Too many incorrect attempts', 'err.codeTooManyAttempts'],
  ['Could not check the code', 'err.codeCheckFailed'],
  ['Could not confirm the code', 'err.codeConfirmFailed'],
  ['SMS is not configured', 'err.smsNotConfigured'],
  ['That phone number could not receive a text', 'err.smsInvalidNumber'],
  ['This number has opted out of our texts', 'err.smsOptedOut'],
  ['We could not send the text message', 'err.smsSendFailed'],
  ['Invalid login credentials', 'err.invalidCredentials'],
  ['Email not confirmed', 'err.emailNotConfirmed'],
  ['User already registered', 'err.userExists'],
  ['Password should be at least', 'err.passwordShort'],
  ['Unable to validate email address', 'err.emailInvalid'],
  ['For security purposes, you can only request this after', 'err.rateLimit'],
  ['This student already has an active team membership.', 'err.teamActive'],
  ['This student is not eligible for the swim team yet.', 'err.teamNotEligible'],
  ['That squad is full.', 'err.squadFull'],
  ['No squad matches this swim level.', 'err.noSquad'],
  ['Trial already used', 'err.trialUsed'],
  ['Student not found', 'err.studentNotFound'],
  ['Parent not found', 'err.parentNotFound'],
  ['Team pricing is not configured. Please contact us.', 'err.teamPricing'],
  ['No active subscription', 'err.noSubscription'],
  ['Unauthorized', 'err.unauthorized'],
]

export function errorKey(raw?: string | null): string | null {
  if (!raw) return null
  for (const [needle, key] of MAP) {
    if (raw.includes(needle)) return key
  }
  return null
}
