from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("reservations", "0002_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="reservation",
            name="subject",
            field=models.CharField(blank=True, max_length=160, verbose_name="Subject"),
        ),
        migrations.AddField(
            model_name="reservation",
            name="group",
            field=models.CharField(blank=True, max_length=100, verbose_name="Group"),
        ),
        migrations.AddField(
            model_name="reservation",
            name="attendees",
            field=models.PositiveIntegerField(blank=True, null=True, verbose_name="Attendees"),
        ),
    ]
