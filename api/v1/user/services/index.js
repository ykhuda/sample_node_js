import db from "../../../../db/models";

export const next_id = async (table_name) => await db.sequelize.query(`
SELECT AUTO_INCREMENT
FROM information_schema.TABLES
WHERE  TABLE_NAME=:table_name`, {
  type: db.Sequelize.QueryTypes.SELECT,
  replacements: {
    table_name,
  },
})

export * from './notification.service.js';
export * from './ups-shipment.service.js';
export * from './credit_card.service.js';
export * from './signatures.service.js';
export * from './template.service.js';
export * from './category.service.js';
export * from './profile.service.js';
export * from './hubspot.service.js';
export * from './redtail.service.js';
export * from './country.service.js';
export * from './address.service.js';
export * from './config.service.js';
export * from './coupon.service.js';
export * from './insert.service.js';
export * from './basket.service.js';
export * from './order.service.js';
export * from './font.service.js';
