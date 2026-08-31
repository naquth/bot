const sequelize = require('../sequelize');

const ServerSetting = require('./ServerSetting');
const ActivityStat = require('./ActivityStat');
const ActivityLog = require('./ActivityLog');
const UserAchievement = require('./UserAchievement');
const UserAdventure = require('./UserAdventure');
const InventoryAdventure = require('./InventoryAdventure');
const AutoReact = require('./AutoReact');
const AutoReply = require('./AutoReply');
const Image = require('./Image');
const BoosterSetting = require('./BoosterSetting');
const Giveaway = require('./Giveaway');
const Reminder = require('./Reminder');
const UserTimezone = require('./UserTimezone');
const UserBirthday = require('./UserBirthday');
const BirthdaySetting = require('./BirthdaySetting');
const WelcomeSetting = require('./WelcomeSetting');
const Counting = require('./Counting');
const CountingUser = require('./CountingUser');
const Checklist = require('./Checklist');
const Invite = require('./Invite');
const InviteHistory = require('./InviteHistory');
const InviteSetting = require('./InviteSetting');
const UserWallet = require('./UserWallet');
const Pet = require('./Pet');
const UserPet = require('./UserPet');
const QuestConfig = require('./QuestConfig');
const QuestGuildLog = require('./QuestGuildLog');
const SavedEmbed = require('./SavedEmbed');
const Streak = require('./Streak');
const SocialAlertSubscription = require('./SocialAlertSubscription');
const SocialAlertSetting = require('./SocialAlertSetting');
const ReactionRolePanel = require('./ReactionRolePanel');
const ReactionRole = require('./ReactionRole');
const VerificationConfig = require('./VerificationConfig');
const ModLog = require('./ModLog');
const TicketConfig = require('./TicketConfig');
const TicketPanel = require('./TicketPanel');
const Ticket = require('./Ticket');
const LevelingSetting = require('./LevelingSetting');
const UserLevel = require('./UserLevel');
const Subdomain = require('./Subdomain');
const DnsRecord = require('./DnsRecord');
const UserFact = require('./UserFact');
const UserAiSetting = require('./UserAiSetting');
const Friend = require('./Friend');
const MathScore = require('./MathScore');

Subdomain.hasMany(DnsRecord, { foreignKey: 'subdomainId', onDelete: 'CASCADE' });
DnsRecord.belongsTo(Subdomain, { foreignKey: 'subdomainId' });

UserPet.belongsTo(Pet, { foreignKey: 'petId', as: 'pet' });
Pet.hasMany(UserPet, { foreignKey: 'petId' });

async function initDatabase() {
	await sequelize.sync();
}

module.exports = {
	sequelize,
	initDatabase,
	ServerSetting,
	ActivityStat,
	ActivityLog,
	UserAchievement,
	UserAdventure,
	InventoryAdventure,
	AutoReact,
	AutoReply,
	Image,
	BoosterSetting,
	Giveaway,
	Reminder,
	UserTimezone,
	UserBirthday,
	BirthdaySetting,
	WelcomeSetting,
	Counting,
	CountingUser,
	Checklist,
	Invite,
	InviteHistory,
	InviteSetting,
	UserWallet,
	Pet,
	UserPet,
	QuestConfig,
	QuestGuildLog,
	SavedEmbed,
	Streak,
	SocialAlertSubscription,
	SocialAlertSetting,
	ReactionRolePanel,
	ReactionRole,
	VerificationConfig,
	ModLog,
	TicketConfig,
	TicketPanel,
	Ticket,
	LevelingSetting,
	UserLevel,
	Subdomain,
	DnsRecord,
	UserFact,
	UserAiSetting,
	Friend,
	MathScore,
};
