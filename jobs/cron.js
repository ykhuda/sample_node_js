import {subscribeCron, authCron, orderCorn, upsShipping, creditCard} from './index.js'
import constants from "../helpers/constants/constants.js";


const {CRON_OPTIONS} = constants

export default () => {
  // subscribeCron.check(CRON_OPTIONS).start()
  // subscribeCron.renew(CRON_OPTIONS).start()
  // subscribeCron.expire(CRON_OPTIONS).start()
  // authCron.clearOldSession(CRON_OPTIONS).start()
  // creditCard.resetRequest(CRON_OPTIONS).start()
  // orderCorn.generateOrder(CRON_OPTIONS).start();
  // upsShipping.voidProcess(CRON_OPTIONS).start()
  // upsShipping.generate(CRON_OPTIONS).start()
  orderCorn.updateSuspendedOrders(CRON_OPTIONS).start();
};
