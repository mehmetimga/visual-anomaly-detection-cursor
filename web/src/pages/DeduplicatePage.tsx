// import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Copy, Trash2, AlertCircle } from 'lucide-react'

export function DeduplicatePage() {
  // const [clusters, setClusters] = useState<any[]>([])

  // This is a placeholder - in a real app, you'd fetch clusters from the API
  const mockClusters = [
    {
      id: '1',
      images: [
        { id: '1a', url: 'https://via.placeholder.com/200', score: 0.98 },
        { id: '1b', url: 'https://via.placeholder.com/200', score: 0.95 },
        { id: '1c', url: 'https://via.placeholder.com/200', score: 0.92 },
      ],
    },
    {
      id: '2',
      images: [
        { id: '2a', url: 'https://via.placeholder.com/200', score: 0.97 },
        { id: '2b', url: 'https://via.placeholder.com/200', score: 0.94 },
      ],
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Deduplicate Images</h1>
        <p className="text-muted-foreground mt-2">
          Find and manage duplicate or near-duplicate images
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Duplicate Detection</CardTitle>
          <CardDescription>
            Images are grouped by visual similarity. Review and manage duplicates.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
            <div className="flex items-start">
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 mr-2" />
              <div className="text-sm text-amber-800">
                <p className="font-semibold">Feature in Development</p>
                <p className="mt-1">
                  The clustering endpoint is not yet implemented. This page shows a mock-up of the deduplication interface.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {mockClusters.map((cluster) => (
              <div key={cluster.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold">
                    Cluster {cluster.id} - {cluster.images.length} images
                  </h3>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline">
                      <Copy className="h-4 w-4 mr-1" />
                      Merge
                    </Button>
                    <Button size="sm" variant="outline">
                      Keep All
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {cluster.images.map((image: any) => (
                    <div
                      key={image.id}
                      className="relative group cursor-pointer"
                    >
                      <div className="aspect-square rounded-lg overflow-hidden border-2 border-transparent hover:border-primary transition-colors">
                        <img
                          src={image.url}
                          alt={`Image ${image.id}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          size="icon"
                          variant="destructive"
                          className="h-6 w-6"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <p className="text-xs text-center mt-1 text-muted-foreground">
                        {(image.score * 100).toFixed(0)}% match
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {mockClusters.length === 0 && (
            <div className="text-center py-12">
              <Copy className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="mt-4 text-sm text-muted-foreground">
                No duplicate clusters found
              </p>
              <Button className="mt-4">Run Deduplication</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
