import validator from 'validator'
import moment from 'moment'
import { timespanGapSeconds } from '../config'
import redis from '../utils/redis/redisCache'

const isDebug = process.env.NODE_ENV !== 'production'

/**
 * 验证用户是否登录
 * 判断cookie, 生成认证信息
 */
const authUser = async (req, res, next) => {
  // let loginData = null
  let jwtToken = req.cookies['jwt-did']

  if (!jwtToken) {
    req.session.loginData = null
  } else {
    const sessionData = req.session.loginData
    const redisData = await redis.get(jwtToken)
    if ((!sessionData && !redisData) || (sessionData && !redisData)) {
      if (req.url.indexOf('/activity') !== -1) {
        return res.redirect('/activity/login')
      }
      return res.redirect('/login')
    } else if (!sessionData && redisData) {
      req.session.loginData = redisData
    }
  }
  // console.log(loginData, '---------login------');
  //  get client real ip;
  req.realIP = req.headers['x-real-ip'] || req.connection.remoteAddress
  next()
}

const requireUser = async (req, res, next) => {
  let loginData = req.session.loginData
  // console.log('middleware......', loginData);
  if (!loginData) {
    return res.redirect('/login')
  }
  next()
}

const filterActivityAction = async (req, res, next) => {
  const referer = req.headers.referer || ''
  if (!isDebug) {
    if (!(referer.trim().includes('http://zhib.net/login'))) {
      return res.send(403)
    }
  }
  next()
}

/**
 * 适用范围：所有接口: 时间戳
 * 验证请求接口时 携带的 时间戳 和 接收到的时间戳对比
 * 服务器接到请求的时间和参数中的时间戳是否相差很长一段时间（时间自定义如timespanGapSeconds秒），
 * 如果超过则说明该url已经过期。
 */
const detectTimespan = async (req, res, next) => {
  try {
    // if (isDebug) return next();
    const timespan = validator.trim(req.query.tsp || '')

    if (timespan.length !== 13 || !validator.isInt(timespan)) {
      return res.send(403)
    }
    // 1  验证时间和服务器时间
    const serverTimespan = Date.now()
    const gapTime = moment(serverTimespan * 1).diff(moment(timespan * 1), 'seconds')
    if (gapTime > timespanGapSeconds) {
      // timespanGapSeconds
      return res.send(403)
    }

    // 3 TODO:同一个时间戳，随机数只能使用一次
    // 验证链接的 timespanKey+randomKey 21位随机传的唯一性
    const uniqueStr = `url_${req.url}|timespan|timespan_${timespan}`
    const uniqueVal = await redis.get(uniqueStr)
    if (uniqueVal) {
      return res.send()
    }
    // 存储改唯一字符串，redis 存储 timespanGapSeconds
    redis.set(uniqueStr, {}, timespanGapSeconds)
    next()
    //
  } catch (err) {
    isDebug && console.log('filter: detectTimespan(): timespan,random 无效:', err)
    return res.send(403)
  }
}

export default {
  authUser,
  requireUser,
  filterActivityAction,
  detectTimespan
}