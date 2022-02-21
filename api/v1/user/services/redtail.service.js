import axios from "axios";
import constants from "../../../../helpers/constants/constants.js";

const {REDTAIL_ULR} = constants;

const getPeople = async (api_key, tag_id) => {
  const {data} = await axios.get(`${REDTAIL_ULR.base_dev}${REDTAIL_ULR.contact_search}`, {
    headers: {
      Authorization: `Basic ${api_key}`,
      include: 'addresses'
    },
    params: {
      tag_id,
    }
  })
  return data
}

export const redtailService = {
  getPeople,
}
