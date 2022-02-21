import {ErrorHandler} from "./error.js";
import constants from "../helpers/constants/constants.js";
import {countryService} from "../api/v1/user/services";

const {INVALID_DATA} = constants

const create = (req, res, next) => {
  try {
    const {
      body: {
        name,
        address1,
        city,
        state,
        zip,
        first_name,
        last_name,
        country_id
      }
    } = req


    if (!name) throw new ErrorHandler(INVALID_DATA, 'name is required!')
    if (!last_name) throw new ErrorHandler(INVALID_DATA, 'last_name is required!')
    if (!first_name) throw new ErrorHandler(INVALID_DATA, 'first_name is required!')
    if (!address1) throw new ErrorHandler(INVALID_DATA, 'address line 1 is required!')
    if (country_id === 1) {
      if (!city) throw new ErrorHandler(INVALID_DATA, 'city is required!')
      if (!state) throw new ErrorHandler(INVALID_DATA, 'state is required!')
      if (!zip) throw new ErrorHandler(INVALID_DATA, 'zip is required!')
    }

    next()
  } catch (e) {
    next(e)
  }
}

const update = async (req, res, next) => {
  try {
    const {
      first_name,
      last_name,
      business_name,
      address1,
      address2,
      city,
      state,
      zip,
      country_id,
      birthday = null,
      name,
      address_id,
    } = req.body

    if (!address_id) throw new ErrorHandler(INVALID_DATA, 'address id error')

    let country;

    if (country_id) {
      country = await countryService.getCountry(country_id)
    }

    if (country_id === 1) {
      if (zip.length < 4) throw new ErrorHandler(INVALID_DATA, 'zip is not valid!')
    }

    const updateObj = {
      first_name,
      last_name,
      business_name,
      address1,
      address2,
      city,
      state,
      zip,
      ...(country ? {country: country.name, country_id: country.id} : {}),
      birthday,
      name,
      address_id,
    };

    req.updateObj = updateObj;
    next()
  } catch (e) {
    next(e)
  }
}
export default {
  create,
  update
}
