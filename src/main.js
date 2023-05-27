const hap = require('hap-nodejs')
const { createLogger, format, transports} = require('winston')
const Gree = require('gree-hvac-client')
const qrcode = require('qrcode-terminal')

const logLevels = {
  fatal: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
}

const logger = createLogger({
  levels: logLevels,
  level: process.env.LOG_LEVEL ?? 'error',
  format: format.combine(format.json(), format.prettyPrint()),
  transports: [new transports.Console()],
})

/// application environment variables
const TARGET_IP = process.env.TARGET_IP
const ACCESSORY_NAME = process.env.ACCESSORY_NAME ?? 'Gree Air Conditioner'

function main() {
  /// setup Gree client
  let unitProperties = {} // Contains current target device properties

  if (TARGET_IP === undefined) {
    logger.fatal('please set the TARGET_IP environment variable.')
    process.exit()
  }
  const client = new Gree.Client({ host: TARGET_IP , debug: process.env.GREE_CLIENT_DEBUG ?? false})

  client.on('update', (updatedProperties, properties) => {
    logger.debug('device reported updated properties: ' + JSON.stringify(updatedProperties))
    logger.trace('current unit state: ' + JSON.stringify(properties))
    unitProperties = properties
  })
  // These two events are unfortunately mutually exclusive but should do the exact same thing
  client.on('success', (updatedProperties, properties) => {
    logger.debug('successfully updated properties:' + JSON.stringify(updatedProperties));
    logger.trace('current unit state: ' + JSON.stringify(properties))
    unitProperties = properties
  })
  client.on('no_response', () => {
    logger.error('no response from target.')
  })

  client.on('connect', client => {
    logger.info('new connection to target: ' + client.getDeviceId())
    /// setup accessory
    const accessory = new hap.Accessory('Tadiran Joy', hap.uuid.generate('hap.tadiran.ac'))
    accessory
      .getService(hap.Service.AccessoryInformation)
      .setCharacteristic(hap.Characteristic.Manufacturer, 'Tadiran')
      .setCharacteristic(hap.Characteristic.Model, 'Joy')
      .setCharacteristic(hap.Characteristic.Name, ACCESSORY_NAME)
      .setCharacteristic(hap.Characteristic.SerialNumber, client.getDeviceId())
      .setCharacteristic(hap.Characteristic.FirmwareRevision, '0.0.1')

    const heaterCoolerService = new hap.Service.HeaterCooler('AC')
    const fanService = new hap.Service.Fan('Fan')

    const activeCharacteristic = heaterCoolerService.getCharacteristic(hap.Characteristic.Active)
    const currentStateCharacteristic = heaterCoolerService.getCharacteristic(
      hap.Characteristic.CurrentHeaterCoolerState,
    )
    const targetStateCharacteristic = heaterCoolerService.getCharacteristic(
      hap.Characteristic.TargetHeaterCoolerState,
    )
    const currentTemperatureCharacteristic = heaterCoolerService.getCharacteristic(
      hap.Characteristic.CurrentTemperature,
    )
    const coolingThresholdTemperatureCharacteristic = heaterCoolerService.getCharacteristic(
      hap.Characteristic.CoolingThresholdTemperature,
    )

    const fanSpeedCharateristic = fanService.getCharacteristic(hap.Characteristic.RotationSpeed)
    const fanActiveCharacteristic = fanService.getCharacteristic(hap.Characteristic.Active)

    /// TODO
    //const displayUnitCharacteristic = heaterCoolerService.getCharacteristic(hap.Characteristic.TemperatureDisplayUnits);
    //const nameCharacteristic = heaterCoolerService.setCharacteristic(hap.Characteristic.Name, ACCESSORY_NAME);

    /// these require a bit more translation from Homekit terminology to ones more compatible with the AC interface
    //const swingModeCharacteristic = heaterCoolerService.getCharacteristic(hap.Characteristic.SwingMode);
    //const heatingThresholdTemperatureCharacteristic = heaterCoolerService.getCharacteristic(
    //  hap.Characteristic.HeatingThresholdTemperature,
    //)

    /// ac active - on/off
    activeCharacteristic
      .onGet(() => {
        const power = unitProperties.power
        logger.trace(`activeState.get() = ${power}`)
        if (power === 'off') {
          return 0 // Inactive
        }
        return 1 // Active
      })
      .onSet(value => {
        logger.trace(`activeState.set(${value})`)
        switch (value) {
          case 0: // Inactive
            client.setProperty('power', 'off')
            break
          case 1: // Active
            client.setProperty('power', 'on')
            break
          default:
            logger.error('got unexpected value: ' + value)
            break
        }
      })

    /// fan active - on/off
    fanActiveCharacteristic.onGet(() => {
      const power = unitProperties.power
      logger.trace(`fanActive.get() = ${power}`)
      if (power === 'off') {
        return 0 // Inactive
      }
      return 1 // Active
    })

    /// current state - heating/cooling + on/off
    currentStateCharacteristic.onGet(() => {
      const power = unitProperties.power
      const mode = unitProperties.mode

      logger.trace(`currentState.get() = ${power}, ${mode}`)
      if (power === 'off') {
        return 0 // Inactive
      }

      switch (mode) {
        case 'cool':
          return 3 // Cooling
          break
        case 'heat':
          return 2 // Heating
          break
        default:
          logger.warn('unsupported/idle mode ' + mode)
          return 1 // Idle
      }
    })

    /// target state - heating/cooling
    targetStateCharacteristic
      .onGet(() => {
        const power = unitProperties.power
        const mode = unitProperties.mode

        logger.trace(`targetState.get() = ${power}, ${mode}`)
        switch (mode) {
          case 'cool':
            return 2 // Cooling
            break
          case 'heat':
            return 1 // Heating
            break
          case 'auto':
            return 0 // Auto
            break
          default:
            logger.warn('unknown target state mode reported: ' + mode)
            return 0 // Auto
        }
      })
      .onSet(value => {
        logger.trace(`targetState.set(${value})`)
        switch (value) {
          case 0: // Auto
            client.setProperty('mode', 'auto')
            break
          case 1: // Heat
            client.setProperty('mode', 'heat')
            break
          case 2: // Cool
            client.setProperty('mode', 'cool')
            break
          default:
            logger.warn('unknown target state mode received: ' + value)
            return 0 // Auto
        }
      })

    /// rotation speed
    fanSpeedCharateristic
      .setProps({
        minValue: 0,
        maxValue: 3,
        minStep: 1,
      })
      .onGet(() => {
        const fanSpeed = unitProperties.fanSpeed

        logger.trace(`fanSpeed.get() = ${fanSpeed}`)
        switch (fanSpeed) {
          case 'auto':
            return 0 // Auto
            break
          case 'low':
            return 1 // Low
            break
          case 'medium':
            return 2 // Medium
            break
          case 'high':
            return 3 // High
            break
          default:
            logger.warn('unknown fan speed: ' + fanSpeed)
            return 0 // Auto
        }
      })
      .onSet(value => {
        logger.trace(`fanSpeed.set(${value})`)
		let fanSpeed;
        switch (value) {
          case 0: // Auto
            fanSpeed = 'auto'
            break
          case 1: // low
            fanSpeed = 'low'
            client.setProperty('fanSpeed', 'low')
            break
          case 2: // medium
            fanSpeed = 'medium'
            client.setProperty('fanSpeed', 'medium')
            break
          case 3: // high
            fanSpeed = 'high'
            client.setProperty('fanSpeed', 'high')
            break
          default:
            fanSpeed = 'auto'
            logger.warn('unexpected fanSpeed value, setting to auto.')
        }
        client.setProperties({ fanSpeed: fanSpeed, turbo: 'off', quiet: 'off' })
      })

    /// current temperature
    currentTemperatureCharacteristic.onGet(() => {
      const currentTemperature = unitProperties.currentTemperature
      logger.trace(`currentTemperature.get() = ${currentTemperature}`)

      return currentTemperature
    })

    /// cooling target - set temperature
    coolingThresholdTemperatureCharacteristic
      .setProps({
        minValue: 16,
        maxValue: 30,
        minStep: 1,
      })
      .onGet(() => {
        const temperature = unitProperties.temperature

        logger.trace(`coolingThresholdTemperature.get() = ${temperature}`)
        return temperature
      })
      .onSet(value => {
        logger.trace(`coolingThresholdTemperature.set(${value})`)
        client.setProperty('temperature', value)
      })

    /// heating target - set temperature
    //heatingThresholdTemperatureCharacteristic
    //  .onGet(() => {
    //    const temperature = unitProperties.temperature

    //    logger.debug("Queried heating threshold temperature: " + temperature)
    //    return temperature
    //  })
    //  .onSet(value => {
    //    logger.debug("Setting heating threshold temperature: " + value)
    //    client.setProperty("temperature", value)
    //  })

    /// bring up service
    accessory.addService(heaterCoolerService)
    accessory.addService(fanService)

    const fake_mac = parseInt(client.getDeviceId(), 16) + 0x133d // We change the mac up slightly for the HAP username
    const formatted_mac = fake_mac
      .toString(16)
      .padStart(12, '0')
      .match(/../g)
      .reverse()
      .slice(0, 6)
      .reverse()
      .join(':') // https://stackoverflow.com/questions/17933471/convert-integer-mac-address-to-string-in-javascript
    const pin_code = fake_mac % 99999999 // this is not intended to be secret in this context
    const formatted_pin_code = [
      pin_code.toString().slice(0, 3),
      pin_code.toString().slice(3, 5),
      pin_code.toString().slice(5, 8),
    ].join('-')

    const setupID = hap.Accessory._generateSetupID()

    /// and publish
    accessory.publish({
      username: formatted_mac,
      pincode: formatted_pin_code,
      setupID: setupID,
      port: 47000 + (fake_mac % 6000), // once again - relate to mac in a close-enough to unique way
      category: hap.Categories.HeaterCooler,
    })

    logger.info('finished accessory setup, running, press Ctrl+C to exit...')
    process.on('SIGINT', function () {
      logger.fatal('Caught interrupt signal')
      process.exit()
    })

    /// print homekit qr-code to screen
    qrcode.generate(makeQrCodeUri(pin_code, setupID))
  })
}

function makeQrCodeUri(pin_code, setupID) {
  let payload = 0
  const flag = 2 // IP
  const version = 0
  const categoryId = hap.Categories.HeaterCooler
  const reserved = 0

  payload = payload | (version & 0x7)

  payload = payload << 4
  payload = payload | (reserved & 0xf)

  payload = payload << 8
  payload = payload | (categoryId & 0xff)

  payload = payload << 4
  payload = payload | (flag & 0xf)

  payload = payload << 27
  payload = payload | (pin_code & 0x7fffffff)

  const payloadBase36 = payload.toString(36).toUpperCase().padStart(9, '0')

  return `X-HM://${payloadBase36}${setupID}`
}

if (require.main === module) {
  main()
}
