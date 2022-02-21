const isDevMode = () => (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test')

export {
  // eslint-disable-next-line import/prefer-default-export
  isDevMode,
}
