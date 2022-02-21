import constants from '../../../../helpers/constants/constants.js'

const {OK} = constants

const check = async (req, res) => {
  const {user} = req;

  const {
    login,
    password,
    last_logged_with,
    test_mode,
    google_id,
    facebook_id,
  } = user;

  const has_no_password = !password

  let last
  if (has_no_password) {
    if (last_logged_with && last_logged_with !== '') {
      last = last_logged_with
    } else if (google_id) {
      last = 'google'
    } else if (facebook_id) {
      last = 'facebook'
    } else {
      last = ''
    }
  } else {
    last = 'email'
  }

  res.status(OK).json({
    httpCode: OK,
    status: 'ok',
    has_no_password,
    last,
    login,
    test_mode,
  })
}

export const checkAuthController = {
  check,
}
