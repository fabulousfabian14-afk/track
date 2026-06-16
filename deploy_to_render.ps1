$token = Read-Host -AsSecureString 'Enter Render API key'
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($token)
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto($ptr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
$headers = @{Authorization = 'Bearer ' + $plain; Accept = 'application/json'}

Write-Host 'Fetching Render workspaces...'
$owners = Invoke-RestMethod -Uri 'https://api.render.com/v1/owners' -Headers $headers -Method Get
if (-not $owners) {
    Write-Error 'No Render owners found for this API key.'
    exit 1
}
$owner = $owners[0]
Write-Host "Using owner: $($owner.name) ($($owner.id))"

$repoUrl = 'https://github.com/fabulousfabian42-sys/kabianga-university.git'
$serviceName = 'kabianga-tracker'
$serviceBody = @{
    type = 'web_service'
    name = $serviceName
    ownerId = $owner.id
    repo = $repoUrl
    branch = 'main'
    serviceDetails = @{
        runtime = 'node'
        plan = 'starter'
        region = 'oregon'
        envSpecificDetails = @{
            buildCommand = 'npm install'
            startCommand = 'npm start'
        }
    }
}

Write-Host "Creating Render service '$serviceName'..."
$response = Invoke-RestMethod -Uri 'https://api.render.com/v1/services' -Headers $headers -Method Post -Body ($serviceBody | ConvertTo-Json -Depth 10) -ContentType 'application/json'

Write-Host 'Render service created successfully!'
Write-Host "Dashboard URL: $($response.dashboardUrl)"
Write-Host "Service ID: $($response.id)"
Write-Host "Deploy status: $($response.status)"
