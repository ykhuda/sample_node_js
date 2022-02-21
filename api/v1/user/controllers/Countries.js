import {countryService} from "../services";
import constants from "../../../../helpers/constants/constants.js";

const {OK} = constants

const list = async (req, res, next) => {
  try {
    const countries = await countryService.getCountriesList()

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      countries,
    })
  } catch (e) {
    next(e)
  }
}

const stateList = async (req, res, next) => {
  try {
    const {query: {country_id}} = req
    const states = await countryService.getStatesList(country_id)

    res.status(OK).json({
      httpCode: OK,
      status: 'ok',
      states,
    })
  } catch (e) {
    next(e)
  }
}


export const countryController = {
  stateList,
  list,
}
