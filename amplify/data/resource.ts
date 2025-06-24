import { type ClientSchema, a, defineData } from "@aws-amplify/backend";

/*== STEP 1 ===============================================================
The section below creates a Todo database table with a "content" field. Try
adding a new "isDone" field as a boolean. The authorization rule below
specifies that any user authenticated via an API key can "create", "read",
"update", and "delete" any "Todo" records.
=========================================================================*/
const schema = a.schema({
  Todo: a
    .model({
      content: a.string(),
    })
    .authorization((allow) => [allow.publicApiKey()]),

  // New model for alcohol check submissions that need approval
  AlcoholCheckSubmission: a
    .model({
      // Add registration type field
      registrationType: a.string().required(), // 運転開始登録, 中間点呼登録, 運転終了登録
      
      // Add driving status field
      drivingStatus: a.string().default("運転中"), // 運転中, 運転終了
      
      // Add related submission ID for linking end registration with start/middle
      relatedSubmissionId: a.string(), // Links 運転終了登録 to original 運転開始登録 or 中間点呼登録
      
      // Azure AD Object ID for @mentions in Teams notifications
      azureObjectId: a.string(), // Store Azure AD Object ID for proper @mentions
      
      // Driver display name for proper @mentions (e.g., "本村 康裕" instead of "motomura00")
      driverDisplayName: a.string(), // Store Azure AD display name for @mentions
      
      // Vehicle form fields - make these optional to handle existing records
      driverName: a.string(), // Remove .required() temporarily
      vehicle: a.string(),
      boardingDateTime: a.string(),
      alightingDateTime: a.string(),
      destination: a.string(),
      address: a.string(),
      purpose: a.string(),
      driverExpirationDate: a.string(),
      
      // Safe driving declaration fields
      hasLicense: a.boolean().default(false),
      noAlcohol: a.boolean().default(false),
      focusOnDriving: a.boolean().default(false),
      vehicleInspection: a.boolean().default(false),
      drivingRule1: a.string(),
      drivingRule2: a.string(),
      
      // Camera section fields - ADD THESE
      inspectionResult: a.string(),
      communicationMessage: a.string(),
      
      // End registration specific fields
      inspectionResultEnd: a.string(),
      communicationMessageEnd: a.string(),
      imageKeyEnd: a.string(), // Separate image for end registration
      
      // Confirmer information (for Azure AD-based approval workflow)
      confirmedBy: a.string(), // Name of the selected confirmer
      confirmerId: a.string(), // ID of the selected confirmer (mailNickname)
      confirmerEmail: a.string(), // Email of the selected confirmer
      confirmerRole: a.string(), // Role of the selected confirmer (上司, 部下, 自己, etc.)
      
      // Legacy and system fields
      imageKey: a.string(),
      submittedBy: a.string().required(),
      submittedAt: a.string().required(),
      approvalStatus: a.string().required(),
      approvedBy: a.string(),
      approvedAt: a.string(),

      teamsNotificationSent: a.boolean().required(),
    })
    .authorization((allow) => [allow.publicApiKey()]),

  // New Driver model
  Driver: a
    .model({
      userId: a.string().required(), // メールアドレスの@以降を除去
      driverId: a.integer().default(999999999), // 初期値：999999999
      name: a.string().required(), // 氏名
      kana: a.string().required(), // 氏名カナ
      company: a.string().required(), // 会社
      employeeNo: a.string().required(), // 社員番号
      mail: a.string().required(), // メールアドレス
      birthday: a.datetime().required(), // 生年月日
      phoneNumber: a.string().required(), // 携帯番号
      driversLicenseNo: a.string().required(), // 免許証番号 (changed from integer to string)
      issueDate: a.datetime().required(), // 免許証交付日
      expirationDate: a.datetime().required(), // 免許証有効期限
      color: a.integer().required(), // 免許証の色
      fileSeq1: a.integer().required(), // 免許証画像(表)
      fileSeq2: a.integer().required(), // 免許証画像(裏)
      fullAdmin: a.boolean().default(false), // フル管理者権限
      isDeleted: a.boolean().default(false), // 削除済み
      createUser: a.string().required(), // 作成者
      createDate: a.datetime().required(), // 作成日時
      updateUser: a.string().required(), // 更新者
      updateDate: a.datetime().required(), // 更新日時
    })
    .authorization((allow) => [allow.publicApiKey()]),



  // Vehicle model - Commented out since using Azure AD for vehicle management
  /* Vehicle: a
    .model({
      plateNumber: a.string().required(), // ナンバープレート
      model: a.string().required(), // 車種
      color: a.string().required(), // 色
      year: a.integer().required(), // 年式
      capacity: a.integer().required(), // 定員
      fuelType: a.string().required(), // 燃料タイプ (ガソリン、ディーゼル、ハイブリッド、電気)
      department: a.string().required(), // 所属部署
      isActive: a.boolean().default(true), // 使用可能状態
      isDeleted: a.boolean().default(false), // 削除済み
      createUser: a.string().required(), // 作成者
      createDate: a.datetime().required(), // 作成日時
      updateUser: a.string().required(), // 更新者
      updateDate: a.datetime().required(), // 更新日時
    })
    .authorization((allow) => [allow.publicApiKey()]), */
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "userPool",
    // API Key is used for a.allow.public() rules
    apiKeyAuthorizationMode: {
      expiresInDays: 30,
    },
  },
});

/*== STEP 2 ===============================================================
Go to your frontend source code. From your client-side code, generate a
Data client to make CRUDL requests to your table. (THIS SNIPPET WILL ONLY
WORK IN THE FRONTEND CODE FILE.)

Using JavaScript or Next.js React Server Components, Middleware, Server 
Actions or Pages Router? Review how to generate Data clients for those use
cases: https://docs.amplify.aws/gen2/build-a-backend/data/connect-to-API/
=========================================================================*/

/*
"use client"
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";

const client = generateClient<Schema>() // use this Data client for CRUDL requests
*/

/*== STEP 3 ===============================================================
Fetch records from the database and use them in your frontend component.
(THIS SNIPPET WILL ONLY WORK IN THE FRONTEND CODE FILE.)
=========================================================================*/

/* For example, in a React component, you can use this snippet in your
  function's RETURN statement */
// const { data: todos } = await client.models.Todo.list()

// return <ul>{todos.map(todo => <li key={todo.id}>{todo.content}</li>)}</ul>
