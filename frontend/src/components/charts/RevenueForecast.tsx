import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { formatCurrency } from '../ui'

interface ForecastMonth {
  period: string
  expected: number
  p10: number
  p50: number
  p90: number
  opportunityCount: number
}

export function RevenueForecast({ data }: { data?: ForecastMonth[] }) {
  const totalExpected = data?.reduce((s, m) => s + m.expected, 0) || 0

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-200">Revenue Forecast (Monte Carlo)</h3>
        <span className="text-xs font-mono text-green-400">
          Expected: {formatCurrency(totalExpected)}
        </span>
      </div>
      {!data || data.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">No pipeline data for forecasting</p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data} margin={{ left: 10, right: 10 }}>
            <defs>
              <linearGradient id="p90Gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="expectedGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="period"
              tick={{ fill: '#9ca3af', fontSize: 10 }}
              tickFormatter={(v) => {
                const [y, m] = v.split('-')
                const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
                return `${months[parseInt(m) - 1]} ${y.slice(2)}`
              }}
            />
            <YAxis
              tick={{ fill: '#9ca3af', fontSize: 10 }}
              tickFormatter={(v) => formatCurrency(v)}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '6px',
                color: '#f3f4f6',
              }}
              formatter={(val: number, name: string) => [formatCurrency(val), name]}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
            <Area
              type="monotone"
              dataKey="p90"
              stroke="#22c55e"
              fill="url(#p90Gradient)"
              strokeWidth={1}
              strokeDasharray="3 3"
              name="Optimistic (P90)"
            />
            <Area
              type="monotone"
              dataKey="expected"
              stroke="#3b82f6"
              fill="url(#expectedGradient)"
              strokeWidth={2}
              name="Expected"
            />
            <Area
              type="monotone"
              dataKey="p10"
              stroke="#ef4444"
              fill="none"
              strokeWidth={1}
              strokeDasharray="3 3"
              name="Conservative (P10)"
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
