// Registry entries for the big clouds and Firebase: AWS, Google Cloud, Azure, Firebase. Same shape as SERVICES in
// recipes.mjs (which spreads these in). Researched 2026-10-23 against each provider's own docs; the sources sit above
// each entry. `guide` is what the agent guide (docs/stack.md in the app's repo, guide.mjs) says about the service.

export const CLOUD_SERVICES = {
  // Sources: docs.aws.amazon.com IAM access keys; SDK static credentials; STS GetCallerIdentity (needs no permission);
  // IAM OIDC providers (CI without a stored key); Vercel reserved env vars (AWS_* allowed).
  aws: {
    id: 'aws', name: 'AWS', mono: 'AW', group: 'cloud', keywords: ['amazon', 's3', 'ses', 'sqs', 'iam', 'lambda'],
    role: 'Storage, email, queues and other cloud services.',
    why: 'Code that runs outside AWS (your machine, Vercel) signs its calls with an access key. The key belongs to an IAM user that can touch only this app\'s resources.',
    inputs: [],
    token: {
      title: 'An access key for an IAM user with one scoped policy',
      create: { href: 'https://console.aws.amazon.com/iam/home#/users/create', label: 'Create IAM user' },
      start: 'Create a user with no console access. Under "Set permissions" pick "Attach policies directly", then "Create policy" and paste a policy that names your own resources.',
      grant: [
        { group: 'S3', item: 's3:ListBucket', level: 'One bucket', why: 'lists files in this one bucket (arn:aws:s3:::your-bucket)' },
        { group: 'S3', item: 's3:GetObject, PutObject, DeleteObject', level: 'Its objects', why: 'reads and writes files in it (arn:aws:s3:::your-bucket/*)' },
      ],
      optional: [
        { group: 'SES', item: 'ses:SendEmail, ses:SendRawEmail', level: 'One identity', why: 'only if the app sends email through SES' },
        { group: 'SQS', item: 'sqs:SendMessage, ReceiveMessage, DeleteMessage', level: 'One queue', why: 'only if the app uses a queue' },
      ],
      resources: 'Name each bucket, queue or identity by its ARN. Never "Resource": "*", and never AdministratorAccess or a FullAccess managed policy.',
      avoid: 'Not root access keys, and not a key on your own admin user.',
      expiry: 'Access keys do not expire. Rotate every 90 days: make the second key, switch, delete the first.',
      once: 'AWS shows the secret access key once. Paste it here before you close the page.',
    },
    steps: [
      { id: 'aws.user', text: 'Create an IAM user for this app with no console access.', link: { href: 'https://console.aws.amazon.com/iam/home#/users/create', label: 'Create user' } },
      { id: 'aws.policy', text: 'Attach one policy that names this app\'s bucket, queue or email identity, and nothing else.', link: { href: 'https://console.aws.amazon.com/iam/home#/policies/create', label: 'Create policy' }, tick: true },
      { id: 'aws.key', text: 'Open the user, "Security credentials", "Create access key". Pick "Application running outside AWS", then copy both parts.', link: { href: 'https://console.aws.amazon.com/iam/home#/users', label: 'Users' }, values: ['accessKeyId', 'secretAccessKey'] },
      { id: 'aws.region', text: 'Type the region your resources live in, like us-east-1.', values: ['region'] },
      { id: 'aws.check', text: 'Press Check it. It shows the account and user this key belongs to.', auto: 'aws.keyOk' },
    ],
    values: [
      // The key ID is half the credential and names the account, so the pair is masked together.
      { key: 'accessKeyId', label: 'Access key ID', env: { server: 'AWS_ACCESS_KEY_ID' }, secret: true, shape: 'awsAccessKeyId', required: true },
      { key: 'secretAccessKey', label: 'Secret access key', env: { server: 'AWS_SECRET_ACCESS_KEY' }, secret: true, shape: 'awsSecretAccessKey', required: true },
      { key: 'region', label: 'Region', env: { server: 'AWS_REGION' }, secret: false, shape: 'awsRegion', required: true,
        where: { href: 'https://console.aws.amazon.com/console/home', label: 'Top right of the console, next to your name' } },
    ],
    check: { id: 'aws', uses: ['accessKeyId', 'secretAccessKey', 'region'], label: 'Check it', note: 'Asks AWS who this key belongs to, once, from your machine. It needs no permission and changes nothing.' },
    actions: [],
    gotchas: [
      'A key that starts ASIA is temporary and stops working within hours. The vault wants an AKIA key.',
      'Your computer\'s clock must be right to within five minutes, or every call fails with a signature error.',
      'On Vercel, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_REGION are allowed. Some other hosts reserve AWS_ names; there, use your own names and hand the key to the SDK in code.',
      'For GitHub Actions, prefer an OIDC role to copying this key into Actions secrets.',
      'Each user can hold two keys. Keep the second slot free so you can rotate.',
    ],
    guide: {
      reads: 'The AWS SDKs (JavaScript v3, boto3, Go, Java) and the AWS CLI read AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_REGION from the environment before any profile. Write `new S3Client({})` with no credentials in code.',
      run: [
        'node scripts/secrets.mjs run --only AWS_ACCESS_KEY_ID,AWS_SECRET_ACCESS_KEY,AWS_REGION -- aws sts get-caller-identity',
        'node scripts/secrets.mjs run --only AWS_ACCESS_KEY_ID,AWS_SECRET_ACCESS_KEY,AWS_REGION -- aws s3 ls s3://your-bucket',
      ],
      test: 'AWS has no test keys. Use a separate sandbox account, or an IAM user whose policy names only -dev resources. Offline: LocalStack or the SDK\'s mock clients. Never point tests at the production bucket.',
      limits: 'Each API throttles per account and region (ThrottlingException); the SDKs retry with backoff. One STS call per session is enough to know the key works.',
      do: ['Keep one IAM user per app, with a policy that names exact ARNs.', 'Unset AWS_PROFILE for a command run with vault values, so you know which identity answered.', 'Presign S3 URLs on the server and hand out only the URL.'],
      dont: ['Run `aws configure`: it writes the key to a plaintext ~/.aws/credentials file.', 'Write $AWS_SECRET_ACCESS_KEY on the outer command line: the shell expands it before the runner injects anything.', 'Use root keys, AdministratorAccess, or keep an ASIA key in the vault.'],
    },
  },

  // Sources: docs.cloud.google.com iam keys-create-delete (keys never expire; key creation blocked by default for
  // organizations made since May 2024; Workload Identity Federation outside Google Cloud); developers.google.com
  // service-account OAuth (JWT bearer); resource-manager v3 projects.get.
  gcp: {
    id: 'gcp', name: 'Google Cloud', mono: 'GC', group: 'cloud', keywords: ['gcp', 'google', 'cloud run', 'storage', 'pubsub', 'bigquery'],
    role: 'Cloud Run, Storage, Pub/Sub and other Google Cloud services.',
    why: 'Code outside Google Cloud signs in as a service account. Its JSON key goes into the vault as one value; app code hands it to the client library, so no key file sits on disk.',
    inputs: [],
    token: {
      title: 'A JSON key for a service account made for this app',
      create: { href: 'https://console.cloud.google.com/iam-admin/serviceaccounts/create', label: 'Create service account' },
      start: 'Name it after the app. On "Grant this service account access to project", add the roles below and nothing else.',
      grant: [{ group: 'Role', item: 'Browser (roles/browser)', level: 'Project', why: 'lets Check it read the project\'s name and state' }],
      optional: [
        { group: 'Role', item: 'Storage Object User', level: 'One bucket', why: 'reads and writes files in that bucket; grant it on the bucket, not the project' },
        { group: 'Role', item: 'Pub/Sub Publisher', level: 'One topic', why: 'only if the app publishes messages' },
        { group: 'Role', item: 'Cloud Run Developer + Service Account User', level: 'Project', why: 'only if this key deploys to Cloud Run' },
      ],
      resources: 'Grant storage and Pub/Sub roles on the one bucket or topic. Never Owner, Editor or Viewer.',
      avoid: 'Not the default compute service account (it has Editor), and not your own gcloud sign-in file.',
      expiry: 'Keys never expire. Rotate every 90 days: make a new key, switch, disable the old one, then delete it.',
      once: 'Google downloads the key file once. Paste its contents here, then delete the downloaded file.',
    },
    steps: [
      { id: 'gcp.project', text: 'Pick or create the project this app uses.', link: { href: 'https://console.cloud.google.com/projectselector2/home/dashboard', label: 'Pick a project' } },
      { id: 'gcp.api', text: 'Turn on the Cloud Resource Manager API (Check it uses it), plus the APIs the app calls.', link: { href: 'https://console.cloud.google.com/apis/library/cloudresourcemanager.googleapis.com', label: 'Enable the API' }, tick: true },
      { id: 'gcp.sa', text: 'Create a service account for this app and give it the roles below.', link: { href: 'https://console.cloud.google.com/iam-admin/serviceaccounts/create', label: 'Create service account' } },
      { id: 'gcp.key', text: 'Open the service account, "Keys", "Add key", "Create new key", JSON. Open the downloaded file and paste all of it here.', link: { href: 'https://console.cloud.google.com/iam-admin/serviceaccounts', label: 'Service accounts' }, values: ['key'],
        note: 'If key creation is greyed out, your organization blocks it (iam.disableServiceAccountKeyCreation). An org policy admin can exempt this project, or use Workload Identity Federation instead.' },
      { id: 'gcp.check', text: 'Press Check it. It fills in the project ID from the key.', values: ['projectId'] },
    ],
    values: [
      { key: 'key', label: 'Service account key (JSON)', env: { server: 'GCP_SERVICE_ACCOUNT_KEY' }, secret: true, shape: 'gcpServiceAccountKey', required: true },
      { key: 'projectId', label: 'Project ID', env: { server: 'GOOGLE_CLOUD_PROJECT' }, secret: false, shape: 'gcpProjectId', required: true, fill: 'check',
        where: { href: 'https://console.cloud.google.com/home/dashboard', label: 'Dashboard, Project info card' } },
    ],
    check: { id: 'gcp', uses: ['key', 'projectId'], label: 'Check it', note: 'Signs in as this service account and reads the project once, from your machine. Nothing is stored but the answer.' },
    actions: [],
    gotchas: [
      'GOOGLE_APPLICATION_CREDENTIALS is a path to a file, not the key. The vault keeps the key; a file exists only while a command that needs one runs.',
      'Organizations created since May 2024 block key creation by default. If "Create new key" is greyed out, that is why.',
      'Check it needs the Cloud Resource Manager API turned on in the service account\'s own project.',
      'Delete the downloaded .json once it is pasted. Never commit it.',
    ],
    guide: {
      reads: 'Google client libraries take the key as an object: `new Storage({ projectId: process.env.GOOGLE_CLOUD_PROJECT, credentials: JSON.parse(process.env.GCP_SERVICE_ACCOUNT_KEY) })`. The same `credentials` option works on GoogleAuth and every @google-cloud client. Application Default Credentials read GOOGLE_APPLICATION_CREDENTIALS, which is a file path, not the key.',
      run: [
        'node scripts/secrets.mjs run --only GCP_SERVICE_ACCOUNT_KEY,GOOGLE_CLOUD_PROJECT -- node scripts/upload.mjs',
      ],
      runNote: 'A tool that insists on a key file (gcloud, Terraform with a path) needs a short script, run under the vault runner, that writes the value to a temp file outside the repo with owner-only permissions, points GOOGLE_APPLICATION_CREDENTIALS at it for that one command, and deletes it in a finally. Set CLOUDSDK_CONFIG to a temp folder so a gcloud sign-in does not linger.',
      test: 'No test keys. Use a separate -dev project with its own service account. Offline: the Pub/Sub, Firestore and Datastore emulators, and fake-gcs-server for Storage.',
      limits: 'Quotas are per API and per project. An access token lasts an hour and the client libraries cache it; do not mint one per request.',
      do: ['Make one service account per app, with predefined roles on the specific bucket or topic.', 'Use Workload Identity Federation in GitHub Actions instead of a key secret.'],
      dont: ['Set GOOGLE_APPLICATION_CREDENTIALS to the JSON itself, or leave a path to a downloaded key in the repo.', 'Print parsed key fields: the runner masks the whole value, not a piece of it.', 'Use Owner, Editor, Viewer or the default compute service account.'],
    },
  },

  // Sources: learn.microsoft.com azure-cli-sp-tutorial-1; entra how-to-add-credentials (secrets up to 24 months, Value
  // shown once); @azure/identity EnvironmentCredential; v2 client credentials flow (Basic auth accepted);
  // Subscriptions - Get; az login --service-principal.
  azure: {
    id: 'azure', name: 'Azure', mono: 'AZ', group: 'cloud', keywords: ['microsoft', 'entra', 'blob', 'cosmos', 'functions'],
    role: 'Storage, Functions, Cosmos DB and other Azure services.',
    why: 'Code outside Azure signs in as an app registration (a service principal) with a client secret. A role on one resource group says what it may touch.',
    inputs: [],
    token: {
      title: 'A client secret for an app registration, with one role on one resource group',
      create: { href: 'https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade', label: 'Open App registrations' },
      start: 'Press "New registration", name it after the app, "Accounts in this organizational directory only", no redirect URI. Then "Certificates & secrets", "Client secrets", "New client secret".',
      grant: [{ group: 'Azure role', item: 'Reader', level: 'Your app\'s resource group', why: 'lets Check it see the group; swap for a narrower data role if that is all the app needs' }],
      optional: [
        { group: 'Azure role', item: 'Storage Blob Data Contributor', level: 'One storage account', why: 'reads and writes blobs' },
        { group: 'Azure role', item: 'Key Vault Secrets User', level: 'One key vault', why: 'reads secrets from that vault' },
        { group: 'Azure role', item: 'Contributor', level: 'Resource group only', why: 'only if this principal deploys resources; never at the subscription' },
      ],
      resources: 'Scope: one resource group, or one resource. Never Owner, never User Access Administrator, never the whole subscription.',
      avoid: 'Not a user account\'s password, and not a secret on an app registration other tools share.',
      expiry: 'Pick 180 days or less (24 months is the limit; Microsoft recommends under 12). Note the date.',
      once: 'Azure shows the secret Value once. Copy the Value column, not the Secret ID, and paste it here before you leave the page.',
    },
    steps: [
      { id: 'az.app', text: 'Register an app for this project. Copy the Application (client) ID and the Directory (tenant) ID from its Overview.', link: { href: 'https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade', label: 'App registrations' }, values: ['clientId', 'tenantId'] },
      { id: 'az.secret', text: 'Under "Certificates & secrets", make a new client secret and copy its Value.', values: ['clientSecret'] },
      { id: 'az.sub', text: 'Copy the subscription ID the app\'s resources live in.', link: { href: 'https://portal.azure.com/#view/Microsoft_Azure_Billing/SubscriptionsBladeV2', label: 'Subscriptions' }, values: ['subscriptionId'] },
      { id: 'az.role', text: 'Open the resource group, "Access control (IAM)", "Add role assignment". Pick the role below and add the app as the member.', link: { href: 'https://portal.azure.com/#view/HubsExtension/BrowseResourceGroups', label: 'Resource groups' }, tick: true,
        note: 'Assigning a role needs Owner, User Access Administrator or Role Based Access Control Administrator on that group.' },
      { id: 'az.check', text: 'Press Check it. It signs in as the app and reads the resource group, or the subscription.', auto: 'azure.tenantOk' },
    ],
    values: [
      { key: 'tenantId', label: 'Directory (tenant) ID', env: { server: 'AZURE_TENANT_ID' }, secret: false, shape: 'guid', required: true },
      { key: 'clientId', label: 'Application (client) ID', env: { server: 'AZURE_CLIENT_ID' }, secret: false, shape: 'guid', required: true },
      { key: 'clientSecret', label: 'Client secret (Value)', env: { server: 'AZURE_CLIENT_SECRET' }, secret: true, shape: 'azureClientSecret', required: true },
      { key: 'subscriptionId', label: 'Subscription ID', env: { server: 'AZURE_SUBSCRIPTION_ID' }, secret: false, shape: 'guid', required: true },
      { key: 'resourceGroup', label: 'Resource group', env: { server: 'AZURE_RESOURCE_GROUP' }, secret: false, shape: 'azureResourceGroup', required: false },
    ],
    check: { id: 'azure', uses: ['tenantId', 'clientId', 'clientSecret', 'subscriptionId', 'resourceGroup'], label: 'Check it', note: 'Signs in as this app and reads the resource group (or the subscription) once, from your machine. Nothing is stored but the answer.' },
    actions: [],
    gotchas: [
      'The secrets page shows a Value and a Secret ID. The Secret ID is a GUID and does not work as a password.',
      'Client secrets expire (24 months at most). When sign-in starts failing with "expired", make a new one and paste it here.',
      'A role on a resource group cannot read the subscription itself. Save the group name so Check it reads that instead.',
      'For GitHub Actions, add a federated credential to this app instead of copying the secret into Actions secrets.',
      'Government and China clouds use other sign-in hosts. Check it knows the public cloud only.',
    ],
    guide: {
      reads: '@azure/identity\'s DefaultAzureCredential (and EnvironmentCredential, which it tries first) reads AZURE_TENANT_ID, AZURE_CLIENT_ID and AZURE_CLIENT_SECRET; azure-identity in Python, .NET, Go and Java does the same. Write `new BlobServiceClient(url, new DefaultAzureCredential())`. Management clients take AZURE_SUBSCRIPTION_ID explicitly. Terraform\'s azurerm reads the ARM_ equivalents.',
      run: [
        'node scripts/secrets.mjs run -- node scripts/sync-blobs.mjs',
        'node scripts/secrets.mjs run --only AZURE_TENANT_ID,AZURE_CLIENT_ID,AZURE_CLIENT_SECRET,AZURE_SUBSCRIPTION_ID -- bash -c \'export AZURE_CONFIG_DIR="$(mktemp -d)"; az login --service-principal --username "$AZURE_CLIENT_ID" --password="$AZURE_CLIENT_SECRET" --tenant "$AZURE_TENANT_ID" --output none && az group list --output table; rm -rf "$AZURE_CONFIG_DIR"\'',
      ],
      runNote: 'The az CLI does not read AZURE_CLIENT_SECRET; it needs az login, which caches a session under ~/.azure. Isolate it with AZURE_CONFIG_DIR and expand the variables inside the child shell, never on the outer line. Prefer SDK code or Terraform, which read the environment directly.',
      test: 'No test keys. Use a separate dev subscription, or at least a separate resource group with its own app registration. Offline: Azurite (Storage) and the Cosmos DB emulator.',
      limits: 'Azure Resource Manager throttles per principal and subscription; a 429 carries Retry-After and the SDKs honour it. Tokens are cached for about an hour; do not fetch one per call.',
      do: ['Assign one role at the resource group or resource scope; prefer data roles over Contributor.', 'Use a federated credential for GitHub Actions instead of storing the secret there.'],
      dont: ['Run az login against your default ~/.azure with the service principal: it replaces your own sign-in.', 'Paste the Secret ID in place of the Value, or pick a secret lifetime over 12 months.'],
    },
  },

  // Sources: firebase.google.com projects/api-keys (web keys are not secret); admin/setup (service accounts, ADC);
  // roles-predefined-product; identity-platform getProjects (projectId and authorizedDomains with an API key).
  firebase: {
    id: 'firebase', name: 'Firebase', mono: 'FB', group: 'data', keywords: ['google', 'firestore', 'auth', 'fcm', 'storage'],
    role: 'Sign-in, Firestore, Storage and messaging from Google.',
    why: 'The browser needs the web config, which names the project and is not secret. A server that runs the Admin SDK outside Google needs a service account key, kept in the vault as one value.',
    inputs: [{ key: 'domain', label: 'Your domain', shape: 'hostname', placeholder: 'example.com', shared: true }],
    token: {
      optionalToken: true,
      title: 'Optional: a service account for the server, with only the roles it uses',
      create: { href: 'https://console.cloud.google.com/iam-admin/serviceaccounts/create', label: 'Create service account' },
      start: 'Only if server code runs the Admin SDK off Google (Vercel, your own box). Make a service account in this project with the roles below, then Keys, Add key, Create new key, JSON. Paste the whole file.',
      grant: [
        { group: 'Role', item: 'Firebase Authentication Admin', level: 'Project', why: 'verifies ID tokens and manages users' },
        { group: 'Role', item: 'Cloud Datastore User', level: 'Project', why: 'reads and writes Firestore' },
      ],
      optional: [
        { group: 'Role', item: 'Storage Object User', level: 'Project', why: 'only if the server reads or writes Storage files' },
        { group: 'Role', item: 'Firebase Cloud Messaging API Admin', level: 'Project', why: 'only if the server sends push messages' },
      ],
      resources: 'This Firebase project only.',
      avoid: 'Not the key from Firebase\'s "Generate new private key" button: that account holds admin over every Firebase product. On App Hosting or Cloud Functions you need no key at all.',
      expiry: 'Service account keys do not expire unless your organization sets a limit. Delete the key when you are done with it.',
      once: 'Google downloads the key file once. Paste it here, then delete the downloaded file.',
    },
    steps: [
      { id: 'fb.new', text: 'Create a Firebase project (or add Firebase to a Google Cloud project).', link: { href: 'https://console.firebase.google.com/', label: 'Firebase console' } },
      { id: 'fb.app', text: 'In Project settings, General, under Your apps, add a web app. Choose Config and copy each value.', link: { href: 'https://console.firebase.google.com/project/_/settings/general', label: 'Project settings' },
        values: ['apiKey', 'authDomain', 'projectId', 'appId'] },
      { id: 'fb.domains', text: 'In Authentication, Settings, Authorized domains, add {domain}.', link: { href: 'https://console.firebase.google.com/project/_/authentication/settings', label: 'Authorized domains' }, auto: 'firebase.domainAuthorized', copy: ['{domain}'] },
      { id: 'fb.key', text: 'Optional: for server code off Google, create the service account below and paste its key file.', values: ['serviceAccount'] },
      { id: 'fb.restrict', text: 'Restrict the browser key to your sites: in Credentials, edit the "Browser key" and set Websites to https://{domain}/* and http://localhost:{port}/*.', link: { href: 'https://console.cloud.google.com/apis/credentials', label: 'Credentials' }, tick: true },
    ],
    values: [
      { key: 'apiKey', label: 'Web API key', env: { public: 'FIREBASE_API_KEY' }, secret: false, shape: 'firebaseApiKey', required: true },
      { key: 'authDomain', label: 'Auth domain', env: { public: 'FIREBASE_AUTH_DOMAIN' }, secret: false, shape: 'firebaseAuthDomain', required: true },
      { key: 'projectId', label: 'Project ID', env: { public: 'FIREBASE_PROJECT_ID', server: 'FIREBASE_PROJECT_ID' }, secret: false, shape: 'gcpProjectId', required: true },
      { key: 'storageBucket', label: 'Storage bucket', env: { public: 'FIREBASE_STORAGE_BUCKET' }, secret: false, shape: 'firebaseBucket', required: false },
      { key: 'messagingSenderId', label: 'Messaging sender ID', env: { public: 'FIREBASE_MESSAGING_SENDER_ID' }, secret: false, shape: 'firebaseSenderId', required: false },
      { key: 'appId', label: 'App ID', env: { public: 'FIREBASE_APP_ID' }, secret: false, shape: 'firebaseAppId', required: true },
      { key: 'measurementId', label: 'Measurement ID', env: { public: 'FIREBASE_MEASUREMENT_ID' }, secret: false, shape: 'gaMeasurementId', required: false },
      { key: 'serviceAccount', label: 'Service account key (JSON)', env: { server: 'FIREBASE_SERVICE_ACCOUNT_KEY' }, secret: true, shape: 'gcpServiceAccountKey', required: false },
    ],
    check: { id: 'firebase', uses: ['apiKey', 'projectId', 'serviceAccount', 'domain'], label: 'Check it', note: 'Asks Firebase, once, from your machine, which project this web key belongs to and which domains may sign in. The service account key is only read here, never sent.' },
    actions: [],
    gotchas: [
      'The web config is not secret. Security Rules and App Check protect your data, not hiding the key.',
      'Never add the Gemini API to the browser key. A Gemini key is a separate, server-only secret.',
      'The service account key never gets a public prefix and never goes in a committed file. The vault holds it as one value.',
      'A browser key locked to websites refuses calls from your terminal. Check it then says it cannot confirm the project, which is fine.',
    ],
    guide: {
      reads: 'The browser builds `initializeApp({ apiKey, authDomain, projectId, ... })` from the public names by hand; the client SDK reads no env. The Admin SDK off Google: `initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)) })`, guarded by `getApps().length`. On App Hosting, Cloud Functions or Cloud Run, `initializeApp()` with no arguments: no key needed there, so do not push one.',
      run: [
        'node scripts/secrets.mjs run --only FIREBASE_SERVICE_ACCOUNT_KEY,FIREBASE_PROJECT_ID -- node scripts/seed-users.mjs',
        'npx firebase emulators:start',
      ],
      runNote: 'firebase-tools wants GOOGLE_APPLICATION_CREDENTIALS as a file path (FIREBASE_TOKEN and login:ci are deprecated). Deploy with the owner\'s own `firebase login` in their terminal, or a short script under the vault runner that writes the key to an owner-only temp file outside the repo for the one command and deletes it.',
      test: 'No test keys. Use a separate project per environment (my-app-dev, my-app-prod). Prefer the Emulator Suite in tests: it needs no credentials, and the SDKs aim at it when FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST are set.',
      limits: 'Quotas are per project and product (Firestore: about one sustained write per second per document). Back off on 429 or RESOURCE_EXHAUSTED.',
      do: ['Keep the web config in public names; protect data with Security Rules and App Check.', 'Use a dedicated service account with only the roles the server needs.'],
      dont: ['Commit a service account JSON, give it a public prefix, or leave a decoded copy in the repo or a temp folder.', 'Add the Gemini API to the browser key.'],
    },
  },
};
