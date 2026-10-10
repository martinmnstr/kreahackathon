// The shared contract. The API, the UI and the card generator all speak RecallEvent.
// Change it here first, then in recalls/build.js.

/**
 * @typedef {"cala" | "openfda"} Source
 *
 * @typedef {object} RecallEvent
 * @property {string} id               stable hash of retailer + company + product
 * @property {string} retailer         key from config.RETAILERS, e.g. "walmart"
 * @property {string} product          "Great Value Organic Blueberries (10 oz)"
 * @property {string|null} brand
 * @property {string|null} company     recalling / manufacturing company (cleaned)
 * @property {string|null} reason      "Possible E. coli contamination"
 * @property {string|null} lotCodes
 * @property {string|null} upc
 * @property {string|null} recallDate  YYYY-MM-DD
 * @property {"day"|"month"|null} datePrecision
 * @property {string[]} states         two-letter codes, incl. PR/DC
 * @property {boolean} nationwide      true → counts for every state
 * @property {boolean} statesComplete  false → the list is partial/unknown ("37 states")
 * @property {string|null} classification  "Class I" | "Class II" | "Class III" (openFDA only)
 * @property {FdaMatch|null} fda
 * @property {CompanyProfile|null} companyProfile
 * @property {Record<string, Source>} sources  where recallDate/states/classification came from
 * @property {object} raw              the untouched Cala row, for debugging
 *
 * @typedef {object} FdaMatch
 * @property {string} recallNumber
 * @property {string} eventId
 * @property {string} firm
 * @property {string} status       "Ongoing" | "Completed" | "Terminated"
 * @property {string} reportDate   YYYY-MM-DD, when FDA published it (recallDate = when it started)
 * @property {string} url
 *
 * @typedef {object} CompanyProfile   from Cala entities
 * @property {string} calaId
 * @property {string|null} legalName
 * @property {string|null} headquarters
 * @property {string|null} foundingDate
 * @property {string|null} cik         SEC id → financials/filings
 * @property {string|null} lei
 * @property {string|null} status
 *
 * @typedef {object} StateSummary
 * @property {string} name
 * @property {number} total            recalls affecting this state (incl. nationwide)
 * @property {number} nationwide
 * @property {number} classI
 * @property {string[]} recallIds
 */
export {};
