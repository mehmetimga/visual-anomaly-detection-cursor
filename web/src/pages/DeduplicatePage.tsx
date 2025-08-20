import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Copy, Trash2, AlertCircle, Loader2, RefreshCw, Image as ImageGen } from 'lucide-react'
import { searchApi, imagesApi } from '@/api/client'
import { useToast } from '@/components/ui/use-toast'

export function DeduplicatePage() {
  const { toast } = useToast()
  const { data, isLoading, refetch } = useQuery({ queryKey: ['deduplicate'], queryFn: () => searchApi.deduplicate({ limit: 200, score_threshold: 0.85 }) })

  const handleDelete = async (id: string) => {
    try {
      await imagesApi.deleteImage(id)
      toast({ title: 'Deleted' })
      refetch()
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const clusters = data?.clusters || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Deduplicate Images</h1>
          <p className="text-muted-foreground mt-2">Find and manage duplicate or near-duplicate images</p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>Refresh</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Duplicate Detection</CardTitle>
          <CardDescription>Images are grouped by visual similarity. Review and manage duplicates.</CardDescription>
        </CardHeader>
        <CardContent>
          {clusters.length === 0 && (
            <div className="text-center py-12">
              <Copy className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="mt-4 text-sm text-muted-foreground">No duplicate clusters found</p>
              <div className="mt-4 inline-flex items-center text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded">
                <AlertCircle className="h-3 w-3 mr-1" /> Upload more similar images to see clusters
              </div>
            </div>
          )}

          <div className="space-y-6">
            {clusters.map((cluster, idx) => (
              <div key={idx} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold">Cluster {idx + 1} - {cluster.images.length} images</h3>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline"><Copy className="h-4 w-4 mr-1" />Merge</Button>
                    <Button size="sm" variant="outline">Keep All</Button>
                  </div>
                </div>
                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {cluster.images.map((image: any) => (
                    <div key={String(image.image_id)} className="relative group cursor-pointer">
                      <div className="aspect-square rounded-lg overflow-hidden border-2 border-transparent hover:border-primary transition-colors">
                        {image.preview_url ? (
                          <img src={image.preview_url} alt={`Image ${image.image_id}`} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">No preview</div>
                        )}
                      </div>
                      <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                        <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => handleReindex(image.image_id)}>
                          <RefreshCw className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => handleThumb(image.image_id)}>
                          <ImageGen className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="destructive" className="h-6 w-6" onClick={() => handleDelete(image.image_id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      {image.score !== undefined && (
                        <p className="text-xs text-center mt-1 text-muted-foreground">{(image.score * 100).toFixed(0)}% match</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
