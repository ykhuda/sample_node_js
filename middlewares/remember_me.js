const checkRememberFlag = (rememberFlag, req) => {
  if (rememberFlag) {
    req.session.cookie.maxAge = 2592000000 // Cookie expires after 30 days
  } else {
    req.session.cookie.expires = false // Cookie expires at end of session
  }
}

export default checkRememberFlag
