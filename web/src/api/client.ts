import axios, { AxiosError } from 'axios'

const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api'
const S3_PROXY_BASE: string = (import.meta as any).env?.VITE_S3_PROXY_BASE || '/s3'

export const apiClient = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add auth token to requests
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      ;(config.headers as any).Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Handle auth errors
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// Auth API
export const authApi = {
  login: async (email: string, password: string) => {
    const { data } = await apiClient.post('/auth/login', { email, password })
    return data
  },

  register: async (email: string, password: string) => {
    const { data } = await apiClient.post('/auth/register', { email, password })
    return data
  },
}

// Images API
export const imagesApi = {
  getPresignedUrl: async (fileName: string) => {
    const { data } = await apiClient.post('/images/presign', { file_name: fileName })
    return data
  },

  ingest: async (bucket: string, key: string, tags?: string[]) => {
    const { data } = await apiClient.post('/images/ingest', { bucket, key, tags })
    return data
  },

  getImage: async (id: string) => {
    const { data } = await apiClient.get(`/images/${id}`)
    return data
  },

  listImages: async (limit = 50) => {
    const { data } = await apiClient.get(`/images`, { params: { limit } })
    return data as { images: Array<{ image_id: string; payload: any; preview_url?: string }>; count: number }
  },

  deleteImage: async (id: string) => {
    const { data } = await apiClient.delete(`/images/${id}`)
    return data
  },

  reindexImage: async (id: string) => {
    const { data } = await apiClient.post(`/images/${id}/reindex`)
    return data
  },

  regenerateThumbnail: async (id: string) => {
    const { data } = await apiClient.post(`/images/${id}/thumbnail`)
    return data
  },
}

// Search API
export const searchApi = {
  searchSimilar: async (params: {
    image_id?: string
    text_query?: string
    limit?: number
    score_threshold?: number
    filter?: Record<string, any>
    include_payload?: boolean
  }) => {
    const { data } = await apiClient.post('/search/similar', params)
    return data
  },

  searchByImage: async (file: File, params?: {
    limit?: number
    score_threshold?: number
    filter?: Record<string, any>
  }) => {
    const formData = new FormData()
    formData.append('image', file)

    if (params?.limit) formData.append('limit', params.limit.toString())
    if (params?.score_threshold) formData.append('score_threshold', params.score_threshold.toString())
    if (params?.filter) formData.append('filter', JSON.stringify(params.filter))

    const { data } = await apiClient.post('/search/similar', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return data
  },

  cluster: async (params: {
    image_ids?: string[]
    filter?: Record<string, any>
    limit: number
    method?: string
  }) => {
    const { data } = await apiClient.post('/search/cluster', params)
    return data
  },

  deduplicate: async (params?: { limit?: number; score_threshold?: number }) => {
    const { data } = await apiClient.post('/deduplicate', params || {})
    return data as { clusters: Array<{ images: Array<{ image_id: string; preview_url?: string; score?: number }> }>; count: number }
  },
}

// QA API
export const qaApi = {
  getAnomalies: async () => {
    const { data } = await apiClient.get('/qa/anomalies')
    return data
  },

  submitFeedback: async (imageId: string, action: string, note?: string) => {
    const { data } = await apiClient.post('/feedback', {
      image_id: imageId,
      action,
      note,
    })
    return data
  },
}

// Upload file to S3 using presigned URL
export const uploadToS3 = async (url: string, file: File) => {
  // If the presigned URL points to the internal Docker hostname, proxy via our web server
  const browserUrl = url.replace(/^https?:\/\/minio:9000/, S3_PROXY_BASE)
  await axios.put(browserUrl, file, {
    headers: {
      'Content-Type': file.type,
    },
  })
}
