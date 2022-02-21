import constants from '../helpers/constants/constants.js'

const {SERVER_ERROR} = constants
class ErrorHandler extends Error {
  constructor(httpCode, message,object) {
    super()
    this.httpCode = httpCode
    this.message = message
    this.object = object
  }
}

const handleErrorMw = (err, res) => {
  const {httpCode, message} = err

  console.log('#################')
  console.error(err)
  console.log('#################')

  if (!httpCode) {
    return res.status(SERVER_ERROR).json({
      status: 'error',
      httpCode: SERVER_ERROR,
      message: `Something went wrong ${message || err}`,
    })
  }
  return res.status(httpCode).json({
    status: 'error',
    httpCode,
    message,
  })
}

export {
  ErrorHandler,
  handleErrorMw,
}
