import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { qaApi } from '@/api/client'
import { useToast } from '@/components/ui/use-toast'
import { AlertTriangle, CheckCircle, Flag, Loader2 } from 'lucide-react'

interface Anomaly {
  image_id: string
  anomaly_score: number
  preview_url: string
  payload: any
}

export function AnomaliesPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['anomalies'],
    queryFn: qaApi.getAnomalies,
  })

  const feedbackMutation = useMutation({
    mutationFn: async ({ imageId, action }: { imageId: string; action: string }) => {
      return await qaApi.submitFeedback(imageId, action)
    },
    onSuccess: (_, variables) => {
      toast({
        title: "Feedback submitted",
        description: `Image marked as ${variables.action}`,
      })
      // Optionally refetch or update cache
      queryClient.invalidateQueries({ queryKey: ['anomalies'] })
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to submit feedback",
        variant: "destructive",
      })
    },
  })

  const handleFeedback = (imageId: string, action: string) => {
    feedbackMutation.mutate({ imageId, action })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const anomalies = data?.anomalies || []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Anomaly Detection</h1>
        <p className="text-muted-foreground mt-2">
          Review images that appear unusual or different from the norm
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Detected Anomalies</CardTitle>
          <CardDescription>
            Images are ranked by their anomaly score. Higher scores indicate more unusual images.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {anomalies.length === 0 ? (
            <div className="text-center py-12">
              <AlertTriangle className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="mt-4 text-sm text-muted-foreground">
                No anomalies detected in your image collection
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {anomalies.map((anomaly: Anomaly) => (
                <div
                  key={anomaly.image_id}
                  className="border rounded-lg overflow-hidden"
                >
                  <div className="aspect-video relative">
                    <img
                      src={anomaly.preview_url}
                      alt={`Anomaly ${anomaly.image_id}`}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2 right-2 bg-red-500 text-white px-2 py-1 rounded text-sm font-semibold">
                      {(anomaly.anomaly_score * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="mb-4">
                      <p className="text-sm font-medium">
                        ID: {anomaly.image_id.slice(0, 12)}...
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Created: {new Date(anomaly.payload.created_at).toLocaleDateString()}
                      </p>
                      {anomaly.payload.tags && anomaly.payload.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {anomaly.payload.tags.map((tag: string) => (
                            <span
                              key={tag}
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleFeedback(anomaly.image_id, 'anomaly')}
                        disabled={feedbackMutation.isPending}
                      >
                        <Flag className="h-4 w-4 mr-1" />
                        Anomaly
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleFeedback(anomaly.image_id, 'relevant')}
                        disabled={feedbackMutation.isPending}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Normal
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
