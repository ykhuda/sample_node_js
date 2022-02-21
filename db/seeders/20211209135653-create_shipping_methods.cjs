'use strict';
const {Op} = require('sequelize')

module.exports = {
  up: async (queryInterface, Sequelize) => {
    return queryInterface.sequelize.transaction(t => queryInterface.bulkInsert('shipping_methods', [
      {
        method_name: '-',
        method_label: 'Seal, Stamp and Mailed',
        discount: 0,
        add_postage_fee: 1,
        check_recipient_address:1,
        check_return_address:1,
        show_options: 0,
        sort_order: 1,
        status: 1,
      },
      {
        method_name: 'SEAL, STAMP, and SHIP',
        method_label: 'Seal, Stamp and Ready to Mail',
        discount: 0,
        check_recipient_address:1,
        check_return_address:1,
        add_postage_fee: 1,
        show_options: 1,
        sort_order: 2,
        status: 1,
      },
      {
        method_name: 'CARD ONLY',
        method_label: 'Card only (no envelope)',
        discount: 0.10,
        check_recipient_address:0,
        check_return_address:0,
        add_postage_fee: 0,
        show_options: 1,
        sort_order: 3,
        status: 1,
      },
      {
        method_name: 'BLANK ENVELOPES',
        method_label: ' Cards with Blank Envelopes',
        discount: 0,
        check_recipient_address:0,
        check_return_address:0,
        add_postage_fee: 0,
        show_options: 1,
        sort_order: 4,
        status: 1,
      },
      {
        method_name: 'DO NOT STAMP. DO NOT SEAL. SHIP',
        method_label: 'Written, addressed, stuffed, unsealed',
        discount: 0,
        check_recipient_address:0,
        check_return_address:0,
        add_postage_fee: 0,
        show_options: 1,
        sort_order: 5,
        status: 1,
      },
      {
        method_name: 'DO NOT STAMP. DO NOT SEAL. SHIP',
        method_label: 'Written, addressed, stuffed, sealed',
        discount: 0,
        check_recipient_address:0,
        check_return_address:0,
        add_postage_fee: 0,
        show_options: 1,
        sort_order: 6,
        status: 1,
      },
    ], {transaction: t}))
  },
  down: async (queryInterface, Sequelize) => {
    return queryInterface.sequelize.transaction(t => queryInterface.bulkDelete('shipping_methods', {
      [Op.or]: [
        {
          method_name: '-',
          method_label: 'Seal, Stamp and Mailed',
          status: 1,
        },
        {
          method_name: 'SEAL, STAMP, and SHIP',
          method_label: 'Seal, Stamp and Ready to Mail',
          status: 1,
        },
        {
          method_name: 'CARD ONLY',
          method_label: 'Card only (no envelope)',
          status: 1,
        },
        {
          method_name: 'BLANK ENVELOPES',
          method_label: ' Cards with Blank Envelopes',
          status: 1,
        },
        {
          method_name: 'DO NOT STAMP. DO NOT SEAL. SHIP',
          method_label: 'Written, addressed, stuffed, unsealed',
          status: 1,
        },
        {
          method_name: 'DO NOT STAMP. DO NOT SEAL. SHIP',
          method_label: 'Written, addressed, stuffed, sealed',
          status: 1,
        }
      ]
    }))
  }
};
