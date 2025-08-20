import { useEffect, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { useMutation } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { imagesApi, uploadToS3 } from '@/api/client'
import { Upload, Image as ImageIcon, CheckCircle, Trash2, RefreshCw, Image as ImageGen } from 'lucide-react'
import { cn } from '@/lib/utils'

interface UploadedFile {
  file: File
  preview: string
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error'
  imageId?: string
  error?: string
}

export function UploadPage() {
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [persisted, setPersisted] = useState<Array<{ image_id: string; preview_url?: string }>>([])
  const { toast } = useToast()

  const loadPersisted = () => {
    imagesApi
      .listImages(50)
      .then((res) => {
        setPersisted(res.images.map((it) => ({ image_id: String(it.image_id), preview_url: it.preview_url })))
      })
      .catch(() => {})
  }

  useEffect(() => {
    loadPersisted()
  }, [])

  const uploadMutation = useMutation({
    mutationFn: async (uploadFile: UploadedFile) => {
      const presignData = await imagesApi.getPresignedUrl(uploadFile.file.name)
      updateFileStatus(uploadFile.file.name, 'uploading')
      await uploadToS3(presignData.url, uploadFile.file)
      updateFileStatus(uploadFile.file.name, 'processing')
      const ingestData = await imagesApi.ingest(presignData.bucket, presignData.key)
      updateFileStatus(uploadFile.file.name, 'completed', ingestData.image_id)
      return ingestData
    },
    onError: (error, uploadFile) => {
      updateFileStatus(uploadFile.file.name, 'error', undefined, (error as any).message)
      toast({ title: 'Upload failed', description: (error as any).message, variant: 'destructive' })
    },
    onSuccess: () => {
      toast({ title: 'Upload successful' })
      loadPersisted()
    },
  })

  const handleDelete = async (id: string) => {
    try {
      if (!window.confirm('Delete this image permanently?')) return
      await imagesApi.deleteImage(id)
      toast({ title: 'Deleted' })
      loadPersisted()
    } catch (e: any) {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' })
    }
  }

  const handleReindex = async (id: string) => {
    try {
      await imagesApi.reindexImage(id)
      toast({ title: 'Reindexed' })
    } catch (e: any) {
      toast({ title: 'Reindex failed', description: e.message, variant: 'destructive' })
    }
  }

  const handleThumb = async (id: string) => {
    try {
      await imagesApi.regenerateThumbnail(id)
      toast({ title: 'Thumbnail regenerated' })
    } catch (e: any) {
      toast({ title: 'Thumbnail failed', description: e.message, variant: 'destructive' })
    }
  }

  const updateFileStatus = (
    fileName: string,
    status: UploadedFile['status'],
    imageId?: string,
    error?: string
  ) => {
    setFiles((prev) =>
      prev.map((f) => (f.file.name === fileName ? { ...f, status, imageId, error } : f))
    )
  }

  const onDrop = (acceptedFiles: File[]) => {
    const newFiles: UploadedFile[] = acceptedFiles.map((file) => ({ file, preview: URL.createObjectURL(file), status: 'pending' as const }))
    setFiles((prev) => [...prev, ...newFiles])
    newFiles.forEach((uploadFile) => {
      uploadMutation.mutate(uploadFile)
    })
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'] },
    maxSize: 10 * 1024 * 1024,
  })

  const clearCompleted = () => {
    setFiles((prev) => prev.filter((f) => f.status !== 'completed'))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Upload Images</h1>
          <p className="text-muted-foreground mt-2">Upload images to analyze for visual anomalies and similarities</p>
        </div>
        <Button variant="outline" onClick={loadPersisted}>Refresh</Button>
      </div>

      {persisted.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Your Recent Images</CardTitle>
            <CardDescription>Persisted images from your account</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {persisted.map((p) => (
                <div key={p.image_id} className="relative group overflow-hidden rounded border">
                  <div className="aspect-square relative">
                    {p.preview_url ? (
                      <img src={p.preview_url} alt={p.image_id} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">No preview</div>
                    )}
                  </div>
                  <div className="p-2 flex items-center justify-between gap-2">
                    <span className="text-xs truncate">{p.image_id.slice(0, 10)}...</span>
                    <div className="flex gap-1">
                      <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => handleReindex(p.image_id)}>
                        <RefreshCw className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => handleThumb(p.image_id)}>
                        <ImageGen className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="destructive" className="h-7 w-7" onClick={() => handleDelete(p.image_id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Upload Images</CardTitle>
          <CardDescription>Drag and drop images or click to browse</CardDescription>
        </CardHeader>
        <CardContent>
          <div {...getRootProps()} className={cn('border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors', isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50')}>
            <input {...getInputProps()} />
            <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
            <p className="mt-4 text-sm text-muted-foreground">{isDragActive ? "Drop the images here..." : "Drag 'n' drop images here, or click to select"}</p>
            <p className="mt-2 text-xs text-muted-foreground">PNG, JPG, JPEG, GIF, WebP up to 10MB</p>
          </div>
        </CardContent>
      </Card>

      {files.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Uploaded Files</CardTitle>
              <CardDescription>
                {files.filter((f) => f.status === 'completed').length} of {files.length} completed
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={clearCompleted} disabled={files.every((f) => f.status !== 'completed')}>
              Clear Completed
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {files.map((file, index) => (
                <div key={index} className="relative group overflow-hidden rounded-lg border">
                  <div className="aspect-square relative">
                    <img src={file.preview} alt={file.file.name} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      {file.status === 'completed' && <CheckCircle className="h-8 w-8 text-green-500" />}
                      {file.status === 'uploading' && <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>}
                      {file.status === 'processing' && (
                        <div className="animate-pulse">
                          <ImageIcon className="h-8 w-8 text-white" />
                        </div>
                      )}
                      {file.status === 'error' && (
                        <div className="text-red-500 text-center p-2">
                          <p className="text-sm">{file.error}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="p-2">
                    <p className="text-sm truncate">{file.file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {file.status === 'completed' && file.imageId ? `ID: ${file.imageId.slice(0, 8)}...` : file.status}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
