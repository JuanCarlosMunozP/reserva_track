from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("spaces", "0003_space_place_alter_space_location_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="space",
            name="category",
            field=models.CharField(
                choices=[
                    ("laboratory", "Laboratorio"),
                    ("classroom", "Aula"),
                    ("gym", "Deportivo"),
                    ("study_room", "Sala"),
                    ("auditory", "Auditorio"),
                    ("other", "Otro"),
                ],
                default="other",
                max_length=200,
                verbose_name="category",
            ),
        ),
    ]
