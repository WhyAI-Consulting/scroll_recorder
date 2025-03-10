# Video Background Generator

Generates video backgrounds by scrolling web pages for AI avatars.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure environment variables:

   Create a `.env` file with the following variables:

   ```bash
   # Server Configuration
   PORT=3000 # Optional, default: 3000

   # AWS S3 Configuration (required)
   AWS_ACCESS_KEY_ID=your_access_key_id
   AWS_SECRET_ACCESS_KEY=your_secret_access_key
   AWS_REGION=your_region # Optional, default: us-east-1
   AWS_BUCKET_NAME=your_bucket_name
   ```

   Make sure your AWS credentials have permissions to:

   - Upload objects to the specified bucket
   - Generate pre-signed URLs for the uploaded objects

## Usage

1. Start the server:

   ```bash
   npm start
   ```

2. Make a POST request to `/api/generate-background` with the following parameters:

   - `url` (required): The webpage URL to record
   - `scrollSpeed` (required): "fast", "medium", or "slow"
   - `resolution` (optional): Video resolution (default: "1920x1080")
   - `scrollDirection` (optional): "down", "up", or "loop" (default: "down")
   - `hideElements` (optional): Array of CSS selectors to hide
   - `duration` (optional): Video duration in seconds

3. The API will return a JSON response with:
   ```json
   {
     "videoUrl": "https://your-bucket.s3.amazonaws.com/video-id.webm?signed-params..."
   }
   ```
   This URL is pre-signed and will be valid for 24 hours. Use it to download or display the generated video.

## Storage

Videos are temporarily stored locally during generation and then automatically uploaded to AWS S3. The local files are deleted after successful upload. The S3 URLs provided are pre-signed and valid for 24 hours.
