import {ErrorHandler} from "./error.js";
import constants from "../helpers/constants/constants.js";

const {UNSUPPORTED_MEDIA} = constants

export default (req, res, next) => {
  const {files: {file}, body: {type = 'logo'}} = req
  const {name} = file

  try {
    if (!name.match(/\.(jpg|JPG|jpeg|JPEG|png|PNG)$/)) {
      throw new ErrorHandler(UNSUPPORTED_MEDIA, 'The selected file is invalid.\nAvailable formats - jpg, jpeg, png')
    }
    req.file = file
    req.type = type
    next()
  } catch (e) {
    next(e)
  }
}
