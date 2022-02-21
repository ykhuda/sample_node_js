import db from "../../../../db/models";

const getOrderConfig = () => db.order_config.findAll({
  where: {status: 1},
  include: [
    {
      model: db.user,
      include: [
        {model: db.integrations},
      ]
    },
    {model: db.card},
    {
      model: db.signatures,
      as: 'order_signature'
    },
    {
      model: db.signatures,
      as: 'order_signature2'
    },
    {model: db.card},
    {
      model: db.fonts,
      as: 'font'
    },
  ],
  raw: true,
  nest: true,
});

export const configService = {
  getOrderConfig
}
