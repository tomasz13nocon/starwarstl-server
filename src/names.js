const names = [
  "Anakin Skywalker",
  "Luke Skywalker",
  "Darth Sidious",
  "Han Solo",
  "R2-D2",
  "Obi-Wan Kenobi",
  "Chewbacca",
  "C-3PO",
  "Yoda",
  "Jabba Desilijic Tiure",
  "Boba Fett",
  "Padmé Amidala",
  "Ahsoka Tano",
  "Dooku",
  "Wilhuff Tarkin",
  "Hera Syndulla",
  "Mace Windu",
  "BB-8",
  "Poe Dameron",
  "Kanan Jarrus",
  "Sabine Wren",
  "Rex",
  "C1-10P",
  "Ezra Bridger",
  "Chelli Lona Aphra",
  "Rey Skywalker",
  "Maul",
  "Garazeb Orrelios",
  "Bail Prestor Organa",
  "Ben Solo",
  "Wedge Antilles",
  "Gial Ackbar",
  "Mon Mothma",
  "Maz Kanata",
  "Qui-Gon Jinn",
  "Owen Lars",
  "Finn",
  "Grievous",
  "Beru Whitesun Lars",
  "Qi'ra",
  "Plo Koon",
  "Jan Dodonna",
  "Bossk'wassak'Cradossk",
  "0-0-0",
  "BT-1",
  "Sana Starros",
  "Dengar",
  "Nien Nunb",
  "Jango Fett",
  "Armitage Hux",
  "Bib Fortuna",
  "Cody",
  "Temmin Wexley",
  "Greedo",
  "Beilert Valance",
  "Phasma",
  "Nubs",
  "Snoke",
  "Kai Brightstar",
  "R5-D4",
  "Asajj Ventress",
  "Hondo Ohnaka",
  "Ki-Adi-Mundi",
  "The Grand Inquisitor",
  "Mas Amedda",
  "Krrsantan",
  "Marchion Ro",
  "Zuckuss",
  "Lys Solay",
  "4-LOM",
  "Biggs Darklighter",
  "Breha Organa",
  "Avar Kriss",
  "Sabé",
  "Wuher",
  "Saw Gerrera",
  "Kit Fisto",
  "Pateesa",
  "Din Djarin",
  "Din Grogu",
  "Kazuda Xiono",
  "Lobot",
  "Jon Vander",
  "Garven Dreis",
  "Firmus Piett",
  "Shara Bey",
  "Mitth'raw'nuruodo",
  "Nute Gunray",
  "Alexsandr Kallus",
  "Jek Tono Porkins",
  "Magna Tolvan",
  "Wrecker",
  "Stellan Gios",
  "Hunter",
  "Echo",
  "Lor San Tekka",
  "Shmi Skywalker Lars",
  "L3-37",
  "T'onga",
  "TK-421",
  "Ochi",
  "Jar Jar Binks",
  "Aayla Secura",
  "Saesee Tiin",
  "Garindan ezz Zavor",
  "Shann Childsen",
  "Omega",
  "R2-A3",
  "Jyn Erso",
  "Tech",
  "Boushh",
  "Wullf Yularen",
  "Evaan Verlaine",
  "Depa Billaba",
  "Vanden Willard",
  "Wolffe",
  "IG-88B",
  "CR-8R",
  "Jarek Yeager",
  "Keeve Trennis",
  "Windy",
  "Neeku Vozo",
  "Kes Dameron",
  "Proxima",
  "Domina Tagge",
  "Torra Doza",
  "Rose Tico",
  "Sskeer",
  "RJ-83",
  "Crosshair",
  "Just Lucky",
  "Luminara Unduli",
  "Cadeliah",
  "Sly Moore",
  "Nash Durango",
  "Losha Tarkon",
  "Shaak Ti",
  "Cassian Jeron Andor",
  "Lula Talisola",
  "Tobias Beckett",
  "Unkar Plutt",
  "Jessika Pava",
  "Wicket Wystri Warrick",
  "Amilyn Holdo",
  "Cornelius Evazan",
  "Trios",
  "Gideon",
  "Imanuel Doza",
  "Tasu Leech",
  "Scourge",
  "Karé Kun",
  "Cad Bane",
  "EV-9D9",
  "Bo-Katan Kryze",
  "Salacious B. Crumb",
  "Lina Soh",
  "Maximilian Veers",
  "Estala Maru",
  "Rae Sloane",
  "Orson Callan Krennic",
  "Savage Opress",
  "Fennec Shand",
  "Tamara Ryvora",
  "Max Rebo",
  "Zeen Mrala",
  "Kendal Ozzel",
  "L'ulo L'ampar",
  "Farzala Tarabal",
  "Great Leveler",
  "Nakano Lash",
  "Zia Zaldor Zanna",
  "SF-R3",
  "Lourna Dee",
  "8D8",
  "ZED-6-7",
  "Jocasta Nu",
  "Eeth Koth",
  "Cassio Tagge",
  "Korin Aphra",
  "Vukorah",
  "Elzar Mann",
  "Terec",
  "Greef Karga",
  "Ponda Baba",
  "Big Bongo",
  "Arihnda Pryce",
  "Ceret",
  "Qort",
  "Adi Gallia",
  "Iden Versio",
  "R1-J5",
  "Freya Fenris",
  "Hype Fazon",
  "Sio Bibble",
  "Deathstick",
  "Nala Se",
  "Fifth Brother",
  "Bo Keevil",
  "Lina Graf",
];

export function getRandomName() {
  let name = names[Math.floor(Math.random() * names.length)];
  return (
    name + " " + String(Math.floor(Math.random() * 10000)).padStart(4, "0")
  );
}
