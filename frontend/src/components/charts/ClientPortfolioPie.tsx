import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { formatCurrency } from '../ui'

const COLORS = ['#3b82f6', '#8b5cf6', '#22c55e', '#eab308', '#ef4444', '#f97316', '#06b6d4', '#ec4899']

interface ClientData {
  name: string
  totalSubmitted: number
  totalWon: number
}

export function ClientPortfolioPie({ clients }: { clients?: ClientData[] }) {
  const data = (clients || [])
    .filter((c) => c.totalSubmitted > 0)
    .map((c) => ({ name: c.name, value: c.totalSubmitted }))

  return (
    <div className="card">
      <h3 className="font-semibold text-gray-200 mb-4">Client Activity Distribution</h3>
      {data.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">No client activity data</p>
      ) : (
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={85}
              dataKey="value"
              paddingAngle={2}
              label={({ name, percent }) =>
                `${name.substring(0, 12)} (${(percent * 100).toFixed(0)}%)`
              }
              labelLine={{ stroke: '#6b7280' }}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '6px',
                color: '#f3f4f6',
              }}
              formatter={(val: number) => [`${val} submissions`, 'Activity']}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
