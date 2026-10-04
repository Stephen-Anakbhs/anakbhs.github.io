$ErrorActionPreference = 'Stop'
$origin = 'https://renjun.one'
$html = (Invoke-WebRequest "$origin/" -TimeoutSec 25).Content
$js = [regex]::Match($html, 'src="(/assets/index-[^"]+\.js)"').Groups[1].Value
if (-not $js) { throw 'Could not locate the deployed entry script' }
$checks = @(
  @{name='http-home';protocol='HTTP';path='/'},
  @{name='https-home';protocol='HTTPS';path='/'},
  @{name='publications';protocol='HTTPS';path='/publications/'},
  @{name='entry-script';protocol='HTTPS';path=$js},
  @{name='font';protocol='HTTPS';path='/fonts/inter-variable.woff2'},
  @{name='video-first-megabyte';protocol='HTTPS';path='/media/hero-background-1080p.mp4';range='bytes=0-1048575'}
)
$records = @()
foreach ($check in $checks) {
  $request = @{method='GET';path=$check.path}
  if ($check.range) { $request.headers = @{Range=$check.range} }
  $body = @{
    type='http';target='renjun.one'
    measurementOptions=@{protocol=$check.protocol;request=$request}
    locations=@(@{country='CN';asn=4134;limit=3},@{country='CN';asn=4837;limit=3},@{country='CN';asn=9808;limit=3})
  } | ConvertTo-Json -Depth 6
  $created = Invoke-RestMethod 'https://api.globalping.io/v1/measurements' -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 25
  $records += @{name=$check.name;path=$check.path;protocol=$check.protocol;id=$created.id;probes=$created.probesCount}
  Write-Output "$($check.name): $($created.id) ($($created.probesCount) probes)"
}
$deadline = (Get-Date).AddMinutes(2)
do {
  $pending = $false
  foreach ($record in $records) {
    if ($record.status -eq 'finished') { continue }
    $r = Invoke-RestMethod "https://api.globalping.io/v1/measurements/$($record.id)" -TimeoutSec 25
    $record.status = $r.status
    $record.results = @($r.results | ForEach-Object {
      @{city=$_.probe.city;country=$_.probe.country;asn=$_.probe.asn;network=$_.probe.network;
        status=$_.result.status;code=$_.result.statusCode;tls=$_.result.tls.authorized;
        ms=$_.result.timings.total;bytes=$_.result.headers.'content-length';
        range=$_.result.headers.'content-range';redirect=$_.result.headers.location;
        failureSource=$_.result.failureSource;message=$_.result.rawOutput;timings=$_.result.timings}
    })
    if ($r.status -ne 'finished') { $pending = $true }
  }
  if ($pending) { Start-Sleep -Seconds 2 }
} while ($pending -and (Get-Date) -lt $deadline)
New-Item -ItemType Directory -Path output/verification -Force | Out-Null
@{checkedAt=(Get-Date).ToUniversalTime().ToString('o');origin=$origin;checks=$records} | ConvertTo-Json -Depth 9 | Set-Content output/verification/mainland-access.json -Encoding utf8
foreach ($record in $records) {
  $record.results | ForEach-Object {
    [pscustomobject]@{check=$record.name;city=$_.city;asn=$_.asn;code=$_.code;tls=$_.tls;ms=$_.ms;range=$_.range;message=$_.message}
  } | ConvertTo-Json -Compress
}
if ($pending) { throw 'Some measurements remain pending; recorded IDs can be polled without starting new tests' }
