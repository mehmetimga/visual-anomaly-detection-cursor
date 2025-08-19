import { useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { useMutation } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { imagesApi, uploadToS3 } from '@/api/client'
import { Upload, Image as ImageIcon, CheckCircle } from 'lucide-react'
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
  const { toast } = useToast()

  const uploadMutation = useMutation({
    mutationFn: async (uploadFile: UploadedFile) => {
      // Get presigned URL
      const presignData = await imagesApi.getPresignedUrl(uploadFile.file.name)
      
      // Update status
      updateFileStatus(uploadFile.file.name, 'uploading')
      
      // Upload to S3
      await uploadToS3(presignData.url, uploadFile.file)
      
      // Update status
      updateFileStatus(uploadFile.file.name, 'processing')
      
      // Ingest image
      const ingestData = await imagesApi.ingest(presignData.bucket, presignData.key)
      
      // Update status with image ID
      updateFileStatus(uploadFile.file.name, 'completed', ingestData.image_id)
      
      return ingestData
    },
    onError: (error, uploadFile) => {
      updateFileStatus(uploadFile.file.name, 'error', undefined, error.message)
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      })
    },
    onSuccess: (_data, uploadFile) => {
      toast({
        title: "Upload successful",
        description: `Image ${uploadFile.file.name} has been processed`,
      })
    },
  })

  const updateFileStatus = (
    fileName: string,
    status: UploadedFile['status'],
    imageId?: string,
    error?: string
  ) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.file.name === fileName
          ? { ...f, status, imageId, error }
          : f
      )
    )
  }

  const onDrop = (acceptedFiles: File[]) => {
    const newFiles: UploadedFile[] = acceptedFiles.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      status: 'pending' as const,
    }))
    
    setFiles((prev) => [...prev, ...newFiles])
    
    // Start uploading each file
    newFiles.forEach((uploadFile) => {
      uploadMutation.mutate(uploadFile)
    })
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
    },
    maxSize: 10 * 1024 * 1024, // 10MB
  })

  const clearCompleted = () => {
    setFiles((prev) => prev.filter((f) => f.status !== 'completed'))
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Upload Images</h1>
        <p className="text-muted-foreground mt-2">
          Upload images to analyze for visual anomalies and similarities
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload Images</CardTitle>
          <CardDescription>
            Drag and drop images or click to browse
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            {...getRootProps()}
            className={cn(
              "border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors",
              isDragActive
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50"
            )}
          >
            <input {...getInputProps()} />
            <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
            <p className="mt-4 text-sm text-muted-foreground">
              {isDragActive
                ? "Drop the images here..."
                : "Drag 'n' drop images here, or click to select"}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              PNG, JPG, JPEG, GIF, WebP up to 10MB
            </p>
          </div>
        </CardContent>
      </Card>

      {files.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Uploaded Files</CardTitle>
              <CardDescription>
                {files.filter((f) => f.status === 'completed').length} of{' '}
                {files.length} completed
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={clearCompleted}
              disabled={files.every((f) => f.status !== 'completed')}
            >
              Clear Completed
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {files.map((file, index) => (
                <div
                  key={index}
                  className="relative group overflow-hidden rounded-lg border"
                >
                  <div className="aspect-square relative">
                    <img
                      src={file.preview}
                      alt={file.file.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      {file.status === 'completed' && (
                        <CheckCircle className="h-8 w-8 text-green-500" />
                      )}
                      {file.status === 'uploading' && (
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                      )}
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
                      {file.status === 'completed' && file.imageId
                        ? `ID: ${file.imageId.slice(0, 8)}...`
                        : file.status}
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
