export default (sequelize, DataTypes) => sequelize.define('coupons', {
  id: {
    autoIncrement: true,
    type: DataTypes.INTEGER,
    allowNull: false,
    primaryKey: true,
  },
  code: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  credit: {
    type: DataTypes.FLOAT,
    allowNull: false,
  },
  used: {
    type: DataTypes.TINYINT,
    allowNull: false,
    defaultValue: 0,
  },
  expiration_date: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  sequelize,
  tableName: 'coupons',
  timestamps: false,
  indexes: [
    {
      name: 'PRIMARY',
      unique: true,
      using: 'BTREE',
      fields: [
        {name: 'id'},
      ],
    },
    {
      name: 'code',
      using: 'BTREE',
      fields: [
        {name: 'code'},
      ],
    },
  ],
});
