// =============================================================
// BigQuery Client Configuration
// Project: gov-con-491005
//
// Auth strategy:
//   Development  → Application Default Credentials (ADC)
//     Run: gcloud auth application-default login
//   Docker/CI    → Set GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
//   Production   → Service account key (Phase 2)
// =============================================================
import { BigQuery } from '@google-cloud/bigquery'
import { logger } from '../utils/logger'

export const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || 'gov-con-491005'

// Dataset in your GCP project where all GovCon analytics tables live
export const BQ_DATASET = process.env.BQ_DATASET || 'govcon_analytics'

// Table names
export const BQ_TABLES = {
  AWARD_HISTORY:   'award_history',
  NAICS_PROFILES:  'naics_profiles',
  AGENCY_PROFILES: 'agency_profiles',
} as const

let _bq: BigQuery | null = null

export function getBigQuery(): BigQuery {
  if (!_bq) {
    const opts: ConstructorParameters<typeof BigQuery>[0] = {
      projectId: GCP_PROJECT_ID,
    }
    // If explicit key file is set (Docker / CI), use it; otherwise ADC
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      opts.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS
    }
    _bq = new BigQuery(opts)
  }
  return _bq
}

/**
 * Ensure the dataset and all tables exist. Idempotent — safe to call on startup.
 */
export async function ensureBigQueryDataset(): Promise<void> {
  const bq = getBigQuery()

  // Dataset
  const dataset = bq.dataset(BQ_DATASET)
  const [exists] = await dataset.exists()
  if (!exists) {
    await dataset.create({ location: 'US' })
    logger.info('BigQuery dataset created', { dataset: BQ_DATASET, project: GCP_PROJECT_ID })
  }

  // award_history table
  await ensureTable(dataset, BQ_TABLES.AWARD_HISTORY, [
    { name: 'id',              type: 'STRING',    mode: 'REQUIRED' },
    { name: 'naicsCode',       type: 'STRING',    mode: 'REQUIRED' },
    { name: 'agency',          type: 'STRING',    mode: 'REQUIRED' },
    { name: 'recipientName',   type: 'STRING',    mode: 'REQUIRED' },
    { name: 'recipientUei',    type: 'STRING',    mode: 'NULLABLE' },
    { name: 'awardAmount',     type: 'FLOAT64',   mode: 'REQUIRED' },
    { name: 'awardDate',       type: 'DATE',      mode: 'NULLABLE' },
    { name: 'setAsideType',    type: 'STRING',    mode: 'NULLABLE' },
    { name: 'offersReceived',  type: 'INT64',     mode: 'NULLABLE' },
    { name: 'extentCompeted',  type: 'STRING',    mode: 'NULLABLE' },
    { name: 'awardType',       type: 'STRING',    mode: 'NULLABLE' },
    { name: 'contractNumber',  type: 'STRING',    mode: 'NULLABLE' },
    { name: 'baseAllOptions',  type: 'FLOAT64',   mode: 'NULLABLE' },
    { name: 'ingestedAt',      type: 'TIMESTAMP', mode: 'REQUIRED' },
  ])

  // naics_profiles — aggregated competition profile per NAICS code
  await ensureTable(dataset, BQ_TABLES.NAICS_PROFILES, [
    { name: 'naicsCode',          type: 'STRING',    mode: 'REQUIRED' },
    { name: 'totalAwards',        type: 'INT64',     mode: 'REQUIRED' },
    { name: 'totalAmount',        type: 'FLOAT64',   mode: 'REQUIRED' },
    { name: 'avgAwardAmount',     type: 'FLOAT64',   mode: 'REQUIRED' },
    { name: 'uniqueRecipients',   type: 'INT64',     mode: 'REQUIRED' },
    { name: 'avgOffersReceived',  type: 'FLOAT64',   mode: 'NULLABLE' },
    { name: 'topRecipient',       type: 'STRING',    mode: 'NULLABLE' },
    { name: 'topRecipientShare',  type: 'FLOAT64',   mode: 'NULLABLE' },
    { name: 'winnerHHI',          type: 'FLOAT64',   mode: 'NULLABLE' },  // competition concentration
    { name: 'computedAt',         type: 'TIMESTAMP', mode: 'REQUIRED' },
  ])

  // agency_profiles — set-aside rates and buying behavior per agency
  await ensureTable(dataset, BQ_TABLES.AGENCY_PROFILES, [
    { name: 'agency',             type: 'STRING',    mode: 'REQUIRED' },
    { name: 'totalAwards',        type: 'INT64',     mode: 'REQUIRED' },
    { name: 'totalAmount',        type: 'FLOAT64',   mode: 'REQUIRED' },
    { name: 'smallBizCount',      type: 'INT64',     mode: 'REQUIRED' },
    { name: 'sdvosbCount',        type: 'INT64',     mode: 'REQUIRED' },
    { name: 'wosbCount',          type: 'INT64',     mode: 'REQUIRED' },
    { name: 'hubzoneCount',       type: 'INT64',     mode: 'REQUIRED' },
    { name: 'smallBizRate',       type: 'FLOAT64',   mode: 'REQUIRED' },
    { name: 'sdvosbRate',         type: 'FLOAT64',   mode: 'REQUIRED' },
    { name: 'avgAwardAmount',     type: 'FLOAT64',   mode: 'REQUIRED' },
    { name: 'topNaicsCodes',      type: 'STRING',    mode: 'NULLABLE' }, // JSON array string
    { name: 'computedAt',         type: 'TIMESTAMP', mode: 'REQUIRED' },
  ])

  logger.info('BigQuery tables verified', { project: GCP_PROJECT_ID, dataset: BQ_DATASET })
}

async function ensureTable(
  dataset: ReturnType<BigQuery['dataset']>,
  tableName: string,
  schema: object[]
): Promise<void> {
  const table = dataset.table(tableName)
  const [exists] = await table.exists()
  if (!exists) {
    await table.create({ schema })
    logger.info('BigQuery table created', { table: tableName })
  }
}
