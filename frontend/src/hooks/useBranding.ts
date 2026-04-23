import { useState, useEffect } from 'react'
import axios from 'axios'

export interface BrandingConfig {
  firmId: string
  firmName: string
  displayName: string
  tagline: string
  logoUrl: string | null
  primaryColor: string
  secondaryColor: string
  faviconUrl: string | null
  isVeteranOwned: boolean
}

const DEFAULT_BRANDING: BrandingConfig = {
  firmId: 'default',
  firmName: 'MrGovCon',
  displayName: 'MrGovCon',
  tagline: 'Transporting Goods, Transforming Lives',
  logoUrl: null,
  primaryColor: '#fbbf24',
  secondaryColor: '#f59e0b',
  faviconUrl: null,
  isVeteranOwned: false,
}

export function useBranding(firmId?: string) {
  const [branding, setBranding] = useState<BrandingConfig>(DEFAULT_BRANDING)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!firmId) {
      setLoading(false)
      return
    }

    const fetchBranding = async () => {
      try {
        setLoading(true)
        const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001'
        const res = await axios.get(`${API_BASE}/api/branding/${firmId}`)
        if (res.data.success && res.data.data) {
          setBranding(res.data.data)
          setError(null)
        }
      } catch (err: any) {
        console.warn('Failed to load branding config:', err.message)
        setError(err.message)
        // Fall back to defaults
        setBranding(DEFAULT_BRANDING)
      } finally {
        setLoading(false)
      }
    }

    fetchBranding()
  }, [firmId])

  return { branding, loading, error }
}
