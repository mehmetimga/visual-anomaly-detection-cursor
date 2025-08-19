import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { searchApi } from '@/api/client'
import { Search, Image as ImageIcon, Type, Loader2 } from 'lucide-react'
import { useDropzone } from 'react-dropzone'
import { cn } from '@/lib/utils'

interface SearchResult {
  image_id: string
  score: number
  preview_url: string
  payload?: any
}

export function SearchPage() {
  const [searchType, setSearchType] = useState<'image' | 'text'>('image')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [textQuery, setTextQuery] = useState('')
  const [limit, setLimit] = useState(20)
  const [scoreThreshold, setScoreThreshold] = useState(0.5)
  const [searchParams, setSearchParams] = useState<any>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['search', searchParams],
    queryFn: async () => {
      if (!searchParams) return null
      
      if (searchParams.type === 'image' && searchParams.file) {
        return await searchApi.searchByImage(searchParams.file, {
          limit: searchParams.limit,
          score_threshold: searchParams.scoreThreshold,
        })
      } else if (searchParams.type === 'text' && searchParams.query) {
        return await searchApi.searchSimilar({
          text_query: searchParams.query,
          limit: searchParams.limit,
          score_threshold: searchParams.scoreThreshold,
          include_payload: true,
        })
      }
      
      return null
    },
    enabled: !!searchParams,
  })

  const onDrop = (acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (file) {
      setImageFile(file)
      setImagePreview(URL.createObjectURL(file))
    }
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
    },
    maxFiles: 1,
  })

  const handleSearch = () => {
    if (searchType === 'image' && imageFile) {
      setSearchParams({
        type: 'image',
        file: imageFile,
        limit,
        scoreThreshold,
      })
    } else if (searchType === 'text' && textQuery) {
      setSearchParams({
        type: 'text',
        query: textQuery,
        limit,
        scoreThreshold,
      })
    }
  }

  const clearSearch = () => {
    setImageFile(null)
    setImagePreview(null)
    setTextQuery('')
    setSearchParams(null)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Search Images</h1>
        <p className="text-muted-foreground mt-2">
          Find similar images using image or text search
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Search Options</CardTitle>
          <CardDescription>
            Choose between image similarity or text-based search
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={searchType} onValueChange={(v) => setSearchType(v as 'image' | 'text')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="image">
                <ImageIcon className="h-4 w-4 mr-2" />
                By Image
              </TabsTrigger>
              <TabsTrigger value="text">
                <Type className="h-4 w-4 mr-2" />
                By Text
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="image" className="space-y-4">
              <div
                {...getRootProps()}
                className={cn(
                  "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
                  isDragActive
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                )}
              >
                <input {...getInputProps()} />
                {imagePreview ? (
                  <div className="space-y-4">
                    <img
                      src={imagePreview}
                      alt="Search image"
                      className="mx-auto h-48 w-48 object-cover rounded-lg"
                    />
                    <p className="text-sm text-muted-foreground">
                      Click or drag to replace
                    </p>
                  </div>
                ) : (
                  <>
                    <ImageIcon className="mx-auto h-12 w-12 text-muted-foreground" />
                    <p className="mt-4 text-sm text-muted-foreground">
                      {isDragActive
                        ? "Drop the image here..."
                        : "Drag 'n' drop an image here, or click to select"}
                    </p>
                  </>
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="text" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="text-query">Text Query</Label>
                <Input
                  id="text-query"
                  placeholder="e.g., red car, sunset landscape, person with glasses"
                  value={textQuery}
                  onChange={(e) => setTextQuery(e.target.value)}
                />
              </div>
            </TabsContent>
          </Tabs>

          <div className="grid grid-cols-2 gap-4 mt-6">
            <div className="space-y-2">
              <Label htmlFor="limit">Results Limit</Label>
              <Input
                id="limit"
                type="number"
                min="1"
                max="100"
                value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value) || 20)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="threshold">Score Threshold</Label>
              <Input
                id="threshold"
                type="number"
                min="0"
                max="1"
                step="0.1"
                value={scoreThreshold}
                onChange={(e) => setScoreThreshold(parseFloat(e.target.value) || 0.5)}
              />
            </div>
          </div>

          <div className="flex gap-4 mt-6">
            <Button
              onClick={handleSearch}
              disabled={
                isLoading ||
                (searchType === 'image' && !imageFile) ||
                (searchType === 'text' && !textQuery)
              }
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Search className="mr-2 h-4 w-4" />
              Search
            </Button>
            <Button variant="outline" onClick={clearSearch}>
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {data?.results && (
        <Card>
          <CardHeader>
            <CardTitle>Search Results</CardTitle>
            <CardDescription>
              Found {data.results.length} similar images
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {data.results.map((result: SearchResult) => (
                <div
                  key={result.image_id}
                  className="relative group overflow-hidden rounded-lg border"
                >
                  <div className="aspect-square relative">
                    <img
                      src={result.preview_url}
                      alt={`Result ${result.image_id}`}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity p-2">
                      <p className="text-white text-sm font-semibold">
                        Score: {result.score.toFixed(3)}
                      </p>
                      <p className="text-white text-xs mt-1">
                        ID: {result.image_id.slice(0, 8)}...
                      </p>
                    </div>
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
