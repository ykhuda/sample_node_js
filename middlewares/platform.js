// ### A middleware to detect user's browser
export default (req, res, next) => {
  const {headers, useragent: {platform}} = req
  const hasKey = Object.prototype.hasOwnProperty

  if (hasKey.call(headers, 'x-client')) {
    if (headers['x-client'] === 'Project_name-iOS') {
      res.locals.platform = 'iOS/App'
      return next()
    }
    if (headers['x-client'] === 'Project_name-Android') {
      res.locals.platform = 'Android/App'
      return next()
    }
  }

  if (platform && platform.match(/iPhone|iPad|iPod/i)) {
    if (platform.match('/Project_name/i')) {
      res.locals.platform = 'iOS/App'
      return next()
    }

    res.locals.platform = 'iOS/Web'
    return next()
  }

  if (platform === 'gzip') {
    res.locals.platform = 'Android/App'
    return next()
  }

  if (platform.match(/Android/i)) {
    if (platform.match(/Project_name/i)) {
      res.locals.platform = 'Android/App'
      return next()
    }

    res.locals.platform = 'Android/Web'
    return next()
  }
  if (platform.match(/(?:Gecko|AppleWebKit|Opera|Trident|Chrome)/i)) {
    res.locals.platform = 'Desktop/Web'
    return next()
  }

  res.locals.platform = 'Unrecognized'
  return next()
};
