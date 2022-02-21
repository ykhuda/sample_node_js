import hubspot from '@hubspot/api-client';

import constants from "../constants/constants.js";
import {simpleUpdateEntity} from "./model.utils.js";
import axios from "axios";

const {HUBSPOT} = constants;

const client = new hubspot.Client({})

const refreshToken = async (hubspot) => {
  const apiResponse = await client.oauth.tokensApi.createToken('refresh_token', null, null, HUBSPOT.client_id, HUBSPOT.clientSecret, hubspot.refresh_token);

  const {body: {accessToken, expiresIn}} = apiResponse;

  await simpleUpdateEntity('hs_portals', {id: hubspot.id}, {token: accessToken, token_expires_in: expiresIn});

  return {token: accessToken, token_expires_in: expiresIn}
}
const OAuth = async (token) => {
  const apiResponse = await client.oauth.accessTokensApi.getAccessToken(token)

  return apiResponse.body.token
}

const createEvent = async (hubspot, params) => {

  for (let i = 0; i < 2; i++) {
    try {
      if (i > 1 || new Date().getTime() >= hubspot.token_expires_in) {
        hubspot = await refreshToken(hubspot)
      }


      client.setAccessToken(hubspot.token)
   const test =   await client.apiRequest({
        method: 'PUT',
        path: '/integrations/v1/179084/timeline/event',
        body: params,
      })

      // todo add created event!!!!
      const res = await axios.put(HUBSPOT.createEventUrl, params, {
        headers: {

          Authorization: `Bearer ${hubspot.token}`,
        },
        responseType: 'json',
        protocol: 1.1,
      })
      // console.log(res);
    } catch (e) {
      console.log('Error creating Hubspot event: ');
    }
  }
}
export const hubspotHelper = {
  OAuth,
  createEvent,
  refreshToken
}
