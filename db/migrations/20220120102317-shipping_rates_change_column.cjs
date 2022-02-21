'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(t => {
    return queryInterface.changeColumn('shipping_rates', 'sort_order', {
      type: Sequelize.INTEGER(10),
      allowNull: true,
    }, {transaction: t})
  }),

  down: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(t => {
    return queryInterface.changeColumn('shipping_rates', 'sort_order', {
      type: Sequelize.INTEGER(10),
      allowNull: false,
    }, {transaction: t})
  })
};
